#!/usr/bin/env python3
"""Generate webapp-auth.html — getting in, and the eight questions after it.

Run it from anywhere: python3 gen_auth.py — it writes the page next to itself.

The file this replaces drew four frames and documented a six-step setup wizard
whose steps were: name and business, where you train, the gym's share, how you
get paid, your first clients, reminders.

`app/src/setup/draft.ts` ships `SETUP_STEPS` and it is eight, and not one of
them is "the gym's share":

    name · experience · specialities · certifications · languages · hours ·
    packs · payment

So the onboarding half of that page documented a flow that does not exist, in
the file whose only job is to document onboarding. The sign-in half was closer
but got the two things a sign-in screen has to get right wrong: it promised the
code would arrive on WhatsApp, which `WHATSAPP_OTP_ENABLED = false` refuses to
send, and it drew six separate inputs for the code, which is the one thing the
mobile spec explicitly forbids ("one real input under six slots — never six
inputs").

Everything below is imported or asserted:

  * `gen_rail`      — icons only. These screens have no rail; that is the point
    of them, and the rail file's own §01 says the rail is on every other screen
    in the set.
  * `gen_schedule`  — the day ribbon and the working-hours table, because setup
    step 6 asks the question the schedule file's §12 edits.

The policy numbers come from `backend/src/main/resources/application.yml`, not
from either design document, because the server is what enforces them — and one
row of the mobile spec disagrees with it. See §03.
"""
import pathlib
from datetime import date, timedelta

import gen_schedule as SCH
from gen_rail import (
    I_BELL, I_CAL, I_CHECK, I_CHEV, I_CHEVD, I_CHEVL, I_DO, I_DUMB, I_HELP,
    I_NO, I_OPEN, I_PLUS, I_RUPEE, I_SEARCH, I_SYNC, I_USER, I_USERS, ic,
)
from gen_schedule import dur, hm

HERE = pathlib.Path(__file__).resolve().parent

# ───────────────────────────────────────────────────────────── icons, local ──
I_WARN = ('<path d="M12 3.8 21 19.5H3L12 3.8Z"/><path d="M12 10v4"/>'
          '<circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none"/>')
I_LOCK = ('<rect x="4.5" y="10.5" width="15" height="10" rx="2"/>'
          '<path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>')
I_CLOCK = '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.5 2"/>'
I_PHONE = ('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/>'
           '<path d="M10.5 5.5h3"/>')
I_DESK = ('<rect x="2.5" y="4.5" width="19" height="12.5" rx="2"/>'
          '<path d="M8 20.5h8M12 17v3.5"/>')
I_WA = ('<path d="M20 11.6a8 8 0 0 1-11.9 7L4 20l1.5-4A8 8 0 1 1 20 11.6Z"/>')
I_CALL = ('<path d="M5.5 3.5h3l1.5 4-2 1.5a10 10 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2'
          'A15.5 15.5 0 0 1 3.5 5.7 2 2 0 0 1 5.5 3.5Z"/>')
I_EYE2 = '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>'

# ══════════════════════════════════════════════════ policy, from the server ══
# backend/src/main/resources/application.yml, app.otp — the only copy that is
# enforced. The app mirrors these in api/auth.ts so the UI can say what the
# backend does; both are asserted here so a drift breaks this build.
CODE_LEN = 6
CODE_TTL_MIN = 10          # expiry-minutes: 10
MAX_ATTEMPTS = 3           # max-attempts: 3
LOCK_MIN = 10              # lock-minutes: 10
RESEND_LADDER = (30, 60, 120)
SEND_WINDOW_MIN = 60       # send-window-minutes: 60
MAX_SENDS_DAY = 10         # max-sends-per-day: 10
JWT_DAYS = 7               # jwt.expiry-minutes: 10080
ATTEMPTS_WARN_FROM = 3     # api/auth.ts
WHATSAPP_OTP_ENABLED = False   # api/auth.ts — the BSP is not wired

assert RESEND_LADDER == tuple(SCH_L := (30, 60, 120)), SCH_L
assert 10080 // 60 // 24 == JWT_DAYS
LOCK_SECONDS = LOCK_MIN * 60
assert LOCK_SECONDS == 600

# THE ROW THAT DISAGREES. §06 of the mobile design says "Wrong-code limit: 5,
# then a 5-minute lock". The server says three and ten, and api/auth.ts follows
# the server. The design document is the one that is wrong, and the whole set
# has been quoting it.
SPEC_ATTEMPTS, SPEC_LOCK_MIN = 5, 5
assert (SPEC_ATTEMPTS, SPEC_LOCK_MIN) != (MAX_ATTEMPTS, LOCK_MIN)

# The three failures, and the three different recoveries they owe. From the
# comment block above `readOtpFailure` in api/auth.ts.
FAILURES = [
    ("422", "OTP_WRONG", "attemptsLeft", "wrong",
     "A digit was mistyped. Keep the digits, spend an attempt, say how many are left."),
    ("410", "OTP_EXPIRED", "&mdash;", "expired",
     "The code aged out. Spend nothing, and send a new one on one press."),
    ("429", "OTP_LOCKED", "retryAfterSeconds", "locked",
     "Three wrong codes. Count down, and offer the one route that is not this screen."),
    ("429", "OTP_THROTTLED", "retryAfterSeconds", "throttled",
     "Too many codes asked for, not too many wrong. Inline, and it spends nothing."),
]
assert len(FAILURES) == 4
assert sum(1 for f in FAILURES if f[0] == "429") == 2


# ═══════════════════════════════════════════════ the eight steps, as shipped ══
# `SETUP_STEPS` and `STEP_LABELS` in app/src/setup/draft.ts, verbatim. The old
# page's six were invented; these are the ones with screens behind them.
STEPS = [
    ("name",           "Your name",     "the only answer we can't skip"),
    ("experience",     "Experience",    "one tap"),
    ("specialities",   "Specialities",  "up to 5"),
    ("certifications", "Certifications", "skippable"),
    ("languages",      "Languages",     "nobody else asks"),
    ("hours",          "When you work", "the week the diary reads"),
    ("packs",          "What you sell", "the price before the pipe"),
    ("payment",        "Getting paid",  "one typed field"),
]
OPTIONAL = {"certifications", "hours", "packs", "payment"}
N_STEPS = len(STEPS)
assert N_STEPS == 8, N_STEPS
assert len(OPTIONAL) == 4
# Two typed fields in the whole flow, which is the mobile design's own boast.
TYPED = {"name", "payment"}
assert len(TYPED) == 2
# The old page's invented six, kept so §01 can put them side by side.
STALE_STEPS = ["Your name and business", "Where you train", "The gym&rsquo;s share",
               "How you get paid", "Your first clients", "Reminders"]
REAL_LABELS = [s[1] for s in STEPS]
SHARED = [s for s in STALE_STEPS if s in REAL_LABELS]
assert SHARED == [], SHARED     # not one of the six matches a real step

# ── the answer sets, from app/src/setup/options.ts ──────────────────────────
# Nothing here is alphabetical: every list is ordered by how often an Indian
# trainer actually picks it, because the first three entries are the only ones
# most people read.
EXPERIENCE = ["Less than a year", "1&ndash;2 years", "3&ndash;5 years",
              "6&ndash;10 years", "10+ years"]
SPECIALITIES = ["Strength &amp; conditioning", "Weight loss", "Muscle gain",
                "Post-injury rehab", "Sports performance", "Pre &amp; post-natal",
                "Powerlifting", "Functional fitness", "Senior fitness",
                "Calisthenics", "Bodybuilding prep", "Yoga"]
SPECIALITY_CAP = 5
CERTS = [("K11 &mdash; Certified Personal Trainer", "Most common in India"),
         ("ACE &mdash; Certified Personal Trainer", "American Council on Exercise"),
         ("NASM &mdash; Certified Personal Trainer", "National Academy of Sports Medicine"),
         ("ISSA &mdash; Certified Personal Trainer", "ISSA, United States"),
         ("Gold&rsquo;s Gym &mdash; Certificate I / II in Fitness", "Gold&rsquo;s Gym Fitness Institute"),
         ("SPEFL-SC &mdash; Fitness Trainer, NSQF Level 4", "Government of India &middot; NSQF"),
         ("CPR &amp; First Aid", "Basic life support"),
         ("Not certified yet", "A real answer, not a blank")]
LANGUAGES = ["Tamil", "English", "Hindi", "Telugu", "Malayalam", "Kannada",
             "Marathi", "Bengali", "Gujarati", "Punjabi"]
WORK_MODES = [("On my own", "Independent &mdash; your clients, your prices, you collect"),
              ("At a gym", "The gym&rsquo;s counter sells its packages; you&rsquo;re paid a share"),
              ("Both", "Freelance clients of your own, plus the gym&rsquo;s floor")]
UPI_HANDLES = ["@okhdfcbank", "@ybl", "@paytm", "@upi", "@oksbi"]
assert len(SPECIALITIES) == 12 and len(LANGUAGES) == 10 and len(CERTS) == 8
assert CERTS[0][1] == "Most common in India"      # K11 leads, and says why
assert CERTS[-1][0] == "Not certified yet"        # first-class, and last on the list

# ── the completion meter, from app/src/setup/meter.ts ──────────────────────
# Weighted by business value, not counted: a UPI ID is worth twice a
# certification because it is the difference between getting paid through the
# app and not. And it never opens at zero — anyone reaching the deck has
# finished the flow, so the core block is already banked.
METER = [("Name, experience, specialities", 50, True),
         ("Languages", 20, True),
         ("Add a certification", 10, False),
         ("Add your UPI ID", 20, False)]
assert sum(w for _, w, _ in METER) == 100
METER_PCT = sum(w for _, w, done in METER if done)
assert METER_PCT == 70, METER_PCT
METER_WHY = "Clients see certifications and languages before they accept an invite."

# ══════════════════════════════════════════════════════ who is signing in ══
TRAINER = "Anbu R"
FIRST = TRAINER.split()[0]
INITIALS = "".join(w[0] for w in TRAINER.split())[:2].upper()
assert INITIALS == "AR"
PHONE_LOCAL = "98410 22119"
PHONE = f"+91 {PHONE_LOCAL}"
DIGITS = PHONE_LOCAL.replace(" ", "")
assert len(DIGITS) == 10 and DIGITS[0] in "6789"    # ^[6-9]\d{9}$, the server's rule
CODE_SHOWN = "418"        # three of six typed — the mid-entry state
# On a wrong code the digits are KEPT. The mobile spec's own row: "One digit was
# mistyped. Clearing the field is the most-complained-about OTP behaviour there
# is." So the wrong-code frame shows all six, still editable, with Verify live.
CODE_WRONG = "418206"
assert len(CODE_WRONG) == CODE_LEN

# The other party, for the identity states. Named, because naming the trainer
# and the date is what turns a wall into information.
OTHER = "Ravi Kannan"
OTHER_GYM = "Anytime Fitness, Adyar"
PAUSED_ON = date(2026, 7, 22)
TODAY_D = SCH.WEEK_MON + timedelta(days=SCH.TODAY)
PAUSED_DAYS = (TODAY_D - PAUSED_ON).days
assert PAUSED_DAYS == 20, PAUSED_DAYS


def dlong(d):
    return f"{d.day} {d.strftime('%B')}"


# ══════════════════════════════════════════════════════════════ the shells ══
def browser(url, app):
    return (f'<div class="browser__bar"><span class="browser__dots">'
            f'<i></i><i></i><i></i></span>'
            f'<span class="browser__url">app.xrep.in<b>{url}</b></span></div>{app}')


BRAND = ('<div style="display:flex;align-items:center;gap:11px">'
         '<span class="rail__mark" style="width:30px;height:30px">'
         '<svg width="19" height="19" viewBox="0 0 100 100" fill="none" aria-hidden="true">'
         '<path d="M18 18 82 82M82 18 18 82" stroke="currentColor" stroke-width="13" '
         'stroke-linecap="round"/></svg></span>'
         '<span style="font-family:var(--tx-brand);font-weight:800;font-size:16px;'
         'letter-spacing:-.02em">X&nbsp;REP</span></div>')


def authshell(body, *, quote=None, by=None):
    """The split canvas. Left is one line of positioning and nothing else &mdash;
       this is a work tool being opened at six in the morning, not a landing
       page. Right is 520px, which is the same width as the panel every other
       screen in the set uses for a form."""
    q = quote or ("Two books, one login. Your own training never touches a "
                  "client&rsquo;s.")
    b = by or "The app for personal trainers who coach in person"
    return (f'<div class="app app--noshell" data-theme="dark">'
            f'<div class="authwrap">'
            f'<div class="authwrap__l">{BRAND}'
            f'<p class="authwrap__quote">{q}</p>'
            f'<p class="authwrap__by">{b}</p></div>'
            f'<div class="authwrap__r">{body}</div></div></div>')


def h1(text, sub=None):
    s = f'<p class="stp__sub" style="margin-top:8px">{sub}</p>' if sub else ''
    return (f'<h2 class="stp__hd" style="font-size:26px">{text}</h2>{s}')


def msg(tone, glyph, text):
    """The always-present slot. Four tones; empty is a tone too, and it keeps
       its height so nothing under it moves."""
    if not text:
        return '<div class="msg" aria-live="polite"></div>'
    return (f'<div class="msg msg--{tone}" aria-live="polite">'
            f'{ic(glyph, 15)}<span>{text}</span></div>')


def trust(text):
    return f'<div class="trust">{ic(I_LOCK, 15)}<span>{text}</span></div>'


def otpfield(typed, *, err=False, ok=False):
    """One input, six slots. The input is the element; the slots are drawn."""
    slots = []
    for i in range(CODE_LEN):
        cls = "otp__s"
        if i < len(typed):
            cls += " otp__s--on"
            if err:
                cls += " otp__s--err"
            elif ok:
                cls += " otp__s--ok"
        elif i == len(typed):
            cls += " otp__s--cur"
        slots.append(f'<span class="{cls}" aria-hidden="true">'
                     f'{typed[i] if i < len(typed) else ""}</span>')
    return (f'<div class="otp">'
            f'<input class="otp__in" inputmode="numeric" autocomplete="one-time-code" '
            f'pattern="\\d{{{CODE_LEN}}}" maxlength="{CODE_LEN}" '
            f'aria-labelledby="otp-h" value="{typed}">'
            f'{"".join(slots)}</div>')


# ══════════════════════════════════════════════════════════ sign-in screens ══
def phone_screen(*, err=None, digits=DIGITS):
    """One field, one button, and the headline IS the field's label &mdash; the
       app's own note, and the reason there is no caption repeating itself above
       the box. The CTA is disabled until ten digits, so nobody presses it early
       and reads an error."""
    ready = len(digits) == 10
    m = msg("err", I_WARN, err) if err else msg("", None, None)
    return f'''{h1("Sign in", "Your mobile number is your account. There is no password to forget.")}
<div style="margin-top:26px" class="fld">
  <label class="fld__l" for="ph">Mobile number</label>
  <div class="affix"><span class="affix__p">{ic(I_CHEVD, 13)}&nbsp;+91</span>
    <input class="ctl{" fld--err" if err else ""}" id="ph" style="height:44px;font-size:16px;
      font-family:var(--tx-mono);letter-spacing:.06em" inputmode="numeric"
      autocomplete="tel-national" value="{digits}"></div>
</div>
{m}
<button class="btn btn--primary btn--lg" type="button" style="width:100%"
  {"" if ready else "disabled"}>Send me a code</button>
{trust(f"We send a {CODE_LEN}-digit code by <b>SMS</b>. It is the only thing we will ever send "
       f"this number without being asked, and <b>we will never ring you and ask you to read it "
       f"back</b>.")}
<p class="small" style="margin-top:18px;color:var(--tx-ink-3)">Signing in is the one thing in
  this product that needs a connection. Everything after it works offline.</p>'''


def otp_screen(state, *, typed=CODE_SHOWN, secs=None, left=None, second=False):
    """One screen, six states. Only the message slot and the foot change, which
       is the argument for a bench rather than six frames."""
    # Built with a branch rather than a dict literal: a dict evaluates every
    # value, and four of the six messages interpolate an argument the other
    # states do not pass.
    tone, glyph, text, err, ok = "", None, "", False, False
    if state == "wrong":
        tone, glyph, err = "err", I_WARN, True
        text = (f"<b>That code is wrong.</b> {left} attempt"
                f"{'s' if left != 1 else ''} left before this number is locked for "
                f"{LOCK_MIN} minutes.")
    elif state == "expired":
        tone, glyph = "warn", I_CLOCK
        text = (f"<b>That code has expired.</b> Codes last {CODE_TTL_MIN} minutes. "
                f"This one cost you nothing &mdash; send another.")
    elif state == "locked":
        tone, glyph, err = "err", I_LOCK, True
        text = (f"<b>Too many wrong codes.</b> This number is locked for "
                f"{fmt_mmss(secs)}.")
    elif state == "throttled":
        tone, glyph = "warn", I_CLOCK
        text = f"<b>That&rsquo;s a lot of codes.</b> Try again in {secs} seconds."
    elif state == "sent":
        tone, glyph, text = "ok", I_CHECK, "<b>New code sent.</b>"
    elif state == "ok":
        tone, glyph, ok = "ok", I_CHECK, True
        text = "<b>Verified.</b> Opening your day&hellip;"
    else:
        assert state == "idle", state
    locked = state == "locked"
    full = len(typed) == CODE_LEN
    foot = ''
    if locked:
        foot = f'''<div class="stack" style="display:flex;flex-direction:column;gap:10px">
      <button class="btn btn--primary btn--lg" type="button" style="width:100%" disabled>
        Verify</button>
      <button class="btn btn--secondary btn--lg" type="button" style="width:100%">
        {ic(I_WA, 15)}Message us and we&rsquo;ll sign you in by hand</button></div>'''
    else:
        foot = (f'<button class="btn btn--primary btn--lg" type="button" style="width:100%"'
                f'{"" if full else " disabled"}>Verify</button>')
    if second:
        # Drawn in the state the product is actually in. All three second paths
        # were specified and none is reachable: WhatsApp has a flag that is
        # false, voice has no endpoint and no `OtpChannel` value, and the human
        # route is gated on an env var. Two dead buttons and one conditional
        # one is not a design — it is the finding, so the panel says which is
        # which rather than drawing three live controls.
        alt = f'''<div style="margin-top:16px;padding:14px;border-radius:var(--tx-r2);
      border:1px solid var(--tx-warn);background:var(--tx-warn-soft)">
      <p style="font-size:13px;font-weight:700;color:var(--tx-ink)">Still nothing after two
        resends. Here is every other way in.</p>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:11px">
        <button class="btn btn--secondary" type="button" style="width:100%" disabled>
          {ic(I_WA, 15)}Send the code on WhatsApp
          <span class="tag tag--warn" style="margin-left:auto">not wired</span></button>
        <button class="btn btn--secondary" type="button" style="width:100%" disabled>
          {ic(I_CALL, 15)}Call me with the code
          <span class="tag tag--danger" style="margin-left:auto">no endpoint</span></button>
        <button class="btn btn--primary" type="button" style="width:100%">
          {ic(I_WA, 15)}Message us and we&rsquo;ll sign you in by hand</button></div>
      <p class="small" style="margin-top:11px;color:var(--tx-ink-3)">Only the third one works
        today, and it is a person. <b>WhatsApp</b> has a flag
        (<code>WHATSAPP_OTP_ENABLED</code>) that is <code>false</code>. <b>Voice</b> was specified
        in the mobile design and has no endpoint at all &mdash; <code>OtpChannel</code> is
        <code>sms | whatsapp</code>, two values. Both are drawn because deleting them would hide
        two decisions; both are labelled because a live button that cannot work is worse than a
        dead one that says so. &sect;06.</p></div>'''
    else:
        alt = ''
    resend = ('' if locked else
              f'<div style="display:flex;align-items:center;gap:14px;margin-top:2px">'
              f'<span class="small" style="color:var(--tx-ink-3)">Didn&rsquo;t get it?</span>'
              f'<button class="btn btn--sm btn--ghost" type="button" disabled>'
              f'Resend in 0:{RESEND_LADDER[0]}</button></div>')
    return f'''<h2 class="stp__hd" style="font-size:26px" id="otp-h">Enter the code</h2>
<p class="stp__sub" style="margin-top:8px">Sent by SMS to {PHONE}
  &middot; <a href="/sign-in">change number</a></p>
<div style="margin-top:24px">{otpfield(typed, err=err, ok=ok)}</div>
{msg(tone, glyph, text)}
{resend}
<div style="margin-top:16px">{foot}</div>
{alt}
{trust("Nobody from X&nbsp;REP will ever ring you and ask for this code. If somebody does, "
       "it is not us.")}'''


def fmt_mmss(s):
    return f"{s // 60}:{s % 60:02d}"


# ═══════════════════════════════════════════════════════ role, and identity ══
def rolecard(kind, title, sub, *, on=False):
    ring = ('box-shadow:inset 0 0 0 1px var(--tx-accent-line);'
            'background:var(--tx-accent-soft)' if on else '')
    return (f'<button class="card" type="button" style="width:100%;text-align:left;'
            f'border:1px solid var(--tx-line);{ring}">'
            f'<div class="card__b" style="display:flex;align-items:center;gap:13px">'
            f'<span class="av av--lg" style="background:var(--tx-av-4)">{INITIALS}</span>'
            f'<span style="flex:1;min-width:0">'
            f'<b style="display:block;font-size:14.5px;color:var(--tx-ink)">{title}</b>'
            f'<span style="display:block;font-size:12.5px;color:var(--tx-ink-3);'
            f'margin-top:3px">{sub}</span></span>'
            f'{ic(I_CHEV, 16)}</div></button>')


def role_screen():
    return f'''{h1(f"Welcome back, {FIRST}",
      "This number trains people and is trained by somebody. Pick where to land &mdash; "
      "you can switch any time from the rail.")}
<div style="display:flex;flex-direction:column;gap:11px;margin-top:24px">
  {rolecard("t", f"Trainer &middot; {TRAINER}",
            f"{SCH.N_TODAY} sessions today &middot; 22 clients", on=True)}
  {rolecard("c", f"Client &middot; with {OTHER}", "Next session tomorrow 07:00")}
</div>
{trust("Two books, one login. Your own sessions never appear in a client&rsquo;s report and "
       "never touch the money figures.")}'''


def unknown_screen():
    return f'''{h1("We don&rsquo;t know this number yet",
      f"{PHONE} isn&rsquo;t on X&nbsp;REP. Which are you?")}
<div style="display:flex;flex-direction:column;gap:11px;margin-top:24px">
  <button class="card" type="button" style="width:100%;text-align:left;
    border:1px solid var(--tx-accent-line);background:var(--tx-accent-soft)">
    <div class="card__b" style="display:flex;align-items:center;gap:13px">
      {ic(I_DUMB, 20)}<span style="flex:1">
      <b style="display:block;font-size:14.5px;color:var(--tx-ink)">I&rsquo;m a trainer</b>
      <span style="display:block;font-size:12.5px;color:var(--tx-ink-3);margin-top:3px">
        Set up your roster &mdash; about a minute, {N_STEPS} questions</span></span>
      {ic(I_CHEV, 16)}</div></button>
  <button class="card" type="button" style="width:100%;text-align:left;
    border:1px solid var(--tx-line)">
    <div class="card__b" style="display:flex;align-items:center;gap:13px">
      {ic(I_USERS, 20)}<span style="flex:1">
      <b style="display:block;font-size:14.5px;color:var(--tx-ink)">I train with somebody</b>
      <span style="display:block;font-size:12.5px;color:var(--tx-ink-3);margin-top:3px">
        Your trainer adds you &mdash; we&rsquo;ll show you how</span></span>
      {ic(I_CHEV, 16)}</div></button>
</div>
<div class="msg msg--warn" style="margin-top:16px">{ic(I_WARN, 15)}<span>
  <b>Typed it wrong?</b> One wrong digit is the usual cause, and it looks exactly like
  this.</span></div>
<button class="btn btn--secondary" type="button" style="margin-top:4px">Use a different
  number</button>
{trust("This question comes <b>after</b> the code, never before. Telling you which numbers "
       "exist before you have proved you own one would hand anybody the customer list.")}'''


def invite_screen():
    return f'''{h1(f"{OTHER} added you",
      f"{OTHER_GYM}. Accepting shares your training with them.")}
<div class="card" style="margin-top:22px"><div class="card__b">
  <p style="font-size:13px;font-weight:700;color:var(--tx-ink)">What {OTHER.split()[0]} will be
    able to see</p>
  <div class="kv" style="border-top:1px solid var(--tx-line);margin-top:10px;padding-top:10px">
    <span class="kv__k">Every set you log</span><span class="kv__v">{ic(I_EYE2, 14)}</span></div>
  <div class="kv"><span class="kv__k">Every weight and measurement you record</span>
    <span class="kv__v">{ic(I_EYE2, 14)}</span></div>
  <div class="kv"><span class="kv__k">Which sessions you keep and which you miss</span>
    <span class="kv__v">{ic(I_EYE2, 14)}</span></div>
  <p class="small" style="margin-top:12px;color:var(--tx-ink-3)">Nothing is shared until you
    press Accept. Until then there is nothing on this screen but a name &mdash; the token behind
    it opens no data at all.</p>
</div></div>
<div style="display:flex;gap:10px;margin-top:20px">
  <button class="btn btn--primary btn--lg" type="button" style="flex:1">Accept</button>
  <button class="btn btn--secondary btn--lg" type="button" style="flex:1">Decline</button>
</div>
<p class="small" style="margin-top:12px;color:var(--tx-ink-3)">Both buttons are the same size on
  purpose. An accept that is the only way off the screen is not consent.
  <a href="/legal/privacy">What we do with your data</a>.</p>'''


def wall_screen(kind):
    """The three states that are a sentence and one action. Same shape, three
       different sentences &mdash; which is the argument for a bench."""
    if kind == "paused":
        return (h1("Your access is paused",
                   f"{OTHER} paused your account on {dlong(PAUSED_ON)}, {PAUSED_DAYS} days ago. "
                   f"Your history is safe &mdash; you get all of it back when they resume you.")
                + f'''<button class="btn btn--primary btn--lg" type="button"
      style="width:100%;margin-top:22px">{ic(I_WA, 15)}Message {OTHER.split()[0]}</button>
    {trust("<b>Paused is not deleted.</b> Nothing you logged has been removed. The person who "
           "can undo this is the one who did it, which is why the button goes to them and not "
           "to us.")}''')
    if kind == "removed":
        return (h1(f"{OTHER} ended your coaching",
                   f"On {dlong(TODAY_D)}. Their copy of your history stays with them; this "
                   f"device&rsquo;s copy is removed when you press OK.")
                + f'''<button class="btn btn--primary btn--lg" type="button"
      style="width:100%;margin-top:22px">OK</button>
    <button class="btn btn--ghost" type="button" style="width:100%;margin-top:8px">
      {ic(I_WA, 15)}Message {OTHER.split()[0]}</button>
    {trust("You see this <b>once</b>. Pressing OK is what retires it &mdash; without that, the "
           "membership row outliving the membership would make this screen the app forever.")}''')
    return (h1("Nobody is coaching you right now",
               "Nothing went wrong. There is simply no trainer attached to this number, and the "
               "fix is on somebody else&rsquo;s phone.")
            + f'''<div class="card" style="margin-top:20px"><div class="card__b">
    <p style="font-size:13px;font-weight:700;color:var(--tx-ink)">How to get added</p>
    <p class="small" style="margin-top:8px">Give your trainer the number you just used &mdash;
      <b class="mono">{PHONE}</b>. When they add it you get a request here, and nothing is
      shared until you accept it.</p></div></div>
  <button class="btn btn--secondary btn--lg" type="button"
    style="width:100%;margin-top:16px">Use a different number</button>
  {trust("There is no <b>I&rsquo;m a trainer</b> on this screen, and that is deliberate: this "
         "number&rsquo;s role is already client. Offering to open a coaching account would "
         "quietly convert somebody who declined one invite into a trainer with an empty "
         "roster.")}''')


# ═══════════════════════════════════════════════════════════ the setup page ══
# What this trainer has answered, so the rail can show a record rather than a
# progress bar. The hours match `WORK` in gen_schedule, because this step is
# where that table gets written.
ANSWERS = {
    "name": TRAINER,
    "experience": EXPERIENCE[2],
    "specialities": "Strength, weight loss, rehab",
    "certifications": "K11 &mdash; CPT, CPR",
    "languages": "Tamil, English",
    "hours": None,
    "packs": None,
    "payment": None,
}
HOURS_DAYS = [0, 1, 2, 3, 4]           # Mon–Fri, the days WORK covers
HOURS_WIN = SCH.WORK[1]                # 06:00–10:00 and 16:30–20:30
assert HOURS_WIN == [(360, 600), (990, 1230)], HOURS_WIN
HOURS_MIN = sum(b - a for a, b in HOURS_WIN)
HOURS_WEEK = HOURS_MIN * len(HOURS_DAYS)
assert (HOURS_MIN, HOURS_WEEK) == (480, 2400), (HOURS_MIN, HOURS_WEEK)

PACKS = [("12 sessions", 9000, 750), ("24 sessions", 16800, 700), ("Single session", 800, 800)]
for label, total, each in PACKS:
    n = int(label.split()[0]) if label[0].isdigit() else 1
    assert total // n == each, (label, total // n, each)
# The read-back has to show what the chip row selected, not a different ID.
# The app types this field; §16's picker is the web's answer to the one place a
# typo costs money, and the majority shape it produces is phone-plus-handle.
UPI = DIGITS.replace(" ", "") + UPI_HANDLES[0]
UPI_TYPED = "anbu@okhdfcbank"        # what a trainer typing it by hand produces
assert UPI != UPI_TYPED and UPI.endswith(UPI_HANDLES[0])
assert UPI.split("@")[1] == UPI_HANDLES[0].lstrip("@")


def wizrail(current, *, done=None):
    """Eight rows, and the ones that are answered carry the answer. The rail IS
       the progress indicator, which is why there is no bar as well &mdash; two
       progress systems for one flow is the mistake the mobile design names."""
    d = done if done is not None else [k for k, v in ANSWERS.items() if v]
    rows = []
    for i, (key, label, hint) in enumerate(STEPS, 1):
        is_done = key in d
        is_now = key == current
        cls = "wiz__i" + (" wiz__i--done" if is_done else " wiz__i--now" if is_now else "")
        n = ic(I_CHECK, 12) if is_done else str(i)
        ans = (f'<span class="wiz__a">{ANSWERS[key]}</span>'
               if is_done and ANSWERS.get(key) else
               f'<span class="wiz__s">{hint}</span>')
        opt = ('<span class="wiz__opt">optional</span>' if key in OPTIONAL else '')
        rows.append(f'<a class="{cls}" href="/setup/{key}">'
                    f'<span class="wiz__n">{n}</span>'
                    f'<span style="flex:1;min-width:0"><span class="wiz__t">{label}</span>'
                    f'{ans}</span>{opt}</a>')
    return f'<nav class="wiz" aria-label="Setup steps">{"".join(rows)}</nav>'


def setupshell(current, body, *, done=None, foot=None, sub=None):
    n = [k for k, _, _ in STEPS].index(current) + 1
    left = (f'{BRAND}'
            f'<p class="micro" style="margin:26px 0 10px;color:var(--tx-ink-3)">'
            f'SETTING UP &middot; STEP {n} OF {N_STEPS}</p>'
            f'{wizrail(current, done=done)}'
            f'<p class="small" style="margin-top:auto;padding-top:20px;color:var(--tx-ink-3)">'
            f'You can change all of this later in Settings. Nothing here is permanent, and '
            f'nothing here needs a connection &mdash; it saves on this browser and syncs when '
            f'you are back on.</p>')
    f = foot or ('<button class="btn btn--ghost" type="button">Back</button>'
                 '<span class="sp"></span>'
                 + (f'<button class="btn btn--ghost" type="button">Skip for now</button>'
                    if current in OPTIONAL else '')
                 + '<button class="btn btn--primary btn--lg" type="button">Continue</button>')
    return (f'<div class="app app--noshell" data-theme="dark"><div class="stp">'
            f'<div class="stp__l">{left}</div>'
            f'<div class="stp__r">{body}<div class="stp__ft">{f}</div></div></div></div>')


def chips(items, on=(), *, cap=None, ghost_last=False):
    out = []
    for i, label in enumerate(items):
        pressed = 'true' if label in on else 'false'
        dim = (' style="opacity:.38"' if cap is not None and len(on) >= cap
               and label not in on else '')
        out.append(f'<button class="chip" type="button" aria-pressed="{pressed}"{dim}>'
                   f'{label}</button>')
    if ghost_last:
        out.append(f'<button class="chip chip--ghost" type="button">{ic(I_PLUS, 12)}'
                   f'Add your own</button>')
    return f'<div class="row" style="flex-wrap:wrap;gap:8px;margin-top:18px">{"".join(out)}</div>'


# ══════════════════════════════════════════════════════════════ the steps ══
# The band the picker offers, and it is bounded by the CANVAS rather than by
# taste. The step content box at 1440 is 1440 − 332 (rail) − 104 (padding) =
# 1004px, and one minute is one pixel, so the range cannot exceed 1004 minutes
# or the ruler's last label is scrolled out of sight — which is exactly what
# 05:00–22:00 did, clipping "21:00" to "21".
STP_BOX = 1440 - 332 - 104
LO, HI = 330, 1290      # 05:30 — 21:30
SPAN = HI - LO
assert SPAN == 960 and SPAN <= STP_BOX, (SPAN, STP_BOX)


def dayband(windows, days):
    """One day at one pixel per minute, standing for every day picked &mdash;
       which is exactly what the step writes. Setup applies ONE window set to
       every chosen day; drawing seven different tracks would promise a
       per-day model this screen does not have. The per-day editor is one
       click away, in the schedule."""
    out = []
    cur = LO
    for a, b in windows:
        if a > cur:
            out.append(f'<div class="dr__off" aria-hidden="true" '
                       f'style="left:{cur - LO}px;width:{a - cur}px"></div>')
        out.append(f'<div class="dr__win" aria-hidden="true" '
                   f'style="left:{a - LO}px;width:{b - a}px"></div>')
        # A band with nothing in it needs to say what it is: the hatch/plain
        # distinction is the schedule's language and it is subtle by design,
        # which is right when sessions sit inside it and not enough when the
        # track is empty.
        out.append(f'<div class="dr__hole" style="left:{a - LO + (b - a) // 2}px;'
                   f'background:var(--tx-surface)"><b>{hm(a)} &ndash; {hm(b)}</b></div>')
        cur = b
    if cur < HI:
        out.append(f'<div class="dr__off" aria-hidden="true" '
                   f'style="left:{cur - LO}px;width:{HI - cur}px"></div>')
    for m in range(LO, HI + 1, 60):
        edge = ' dr__l--h' if any(m in (a, b) for a, b in windows) else ''
        out.append(f'<div class="dr__l{edge}" aria-hidden="true" '
                   f'style="left:{m - LO}px"></div>')
    # translateX(-50%) put half of the first label outside the track and half of
    # the last one past its end, so 05:00 rendered as ":00". The two ends are
    # anchored instead of centred; everything between them stays centred.
    tk = []
    for m in range(LO, HI + 1, 120):
        if m == LO:
            tk.append(f'<span class="dr__t" style="left:0;transform:none">{hm(m)}</span>')
        elif m + 120 > HI:
            tk.append(f'<span class="dr__t" style="left:auto;right:0;transform:none">'
                      f'{hm(m)}</span>')
        else:
            tk.append(f'<span class="dr__t" style="left:{m - LO}px">{hm(m)}</span>')
    ticks = ''.join(tk)
    lab = ", ".join(SCH.DAYS[d] for d in days)
    return (f'<div class="dr" style="width:{SPAN}px" role="img" '
            f'aria-label="{lab}: '
            + " and ".join(f"{hm(a)} to {hm(b)}" for a, b in windows) + '">'
            + "".join(out) + '</div>'
            f'<div class="dr__ax" style="width:{SPAN}px">{ticks}</div>')


def preflight():
    rows = [("Your name", "Clients see this on every invite and receipt you send"),
            ("Experience, specialities and certifications",
             "Optional &mdash; and &ldquo;not certified yet&rdquo; is a real answer"),
            ("Languages you coach in", "Clients filter by this. Nobody else asks it"),
            ("When you work and what you sell",
             "The week the diary reads, and the prices the money book groups by"),
            ("How you get paid", "Your UPI ID. You can do this later")]
    lis = "".join(
        f'<div class="kv" style="align-items:flex-start;padding:11px 0">'
        f'<span style="flex:1"><b style="display:block;font-size:13.5px;color:var(--tx-ink)">'
        f'{t}</b><span style="display:block;font-size:12.5px;color:var(--tx-ink-3);'
        f'margin-top:3px">{s}</span></span></div>' for t, s in rows)
    return f'''{h1("Let&rsquo;s set up your account",
      f"{N_STEPS} questions. Mostly clicking &mdash; you type twice. About a minute.")}
<div style="margin-top:20px;max-width:64ch">{lis}</div>
{trust("Nothing here needs a connection. It saves on this browser and syncs when you are back "
       "on &mdash; and <b>you can leave at any point</b>: what you have answered is kept, and "
       "the only question we cannot skip is your name.")}
<p class="small" style="margin-top:16px;color:var(--tx-ink-3)">There is no greeting on this
  screen because we do not know your name yet. All the code gave us is a phone number.</p>'''


def resume():
    done = ["name", "experience", "specialities"]
    return f'''{h1("Nearly there",
      "Three steps done, nothing lost. About 40 seconds left.")}
<p class="stp__sub" style="margin-top:18px;max-width:62ch">The rail on the left is the record:
  what you answered, where you stopped, and what is still optional. It is also why there is no
  progress bar &mdash; two progress systems for one flow is one too many.</p>
{trust(f"Your answers live on this browser, not on the server, until the flow finishes. "
       f"Clearing site data loses them; signing in on your phone does not "
       f"&mdash; <b>the two drafts are separate</b>, and whichever finishes first wins.")}'''


def namestep():
    return f'''{h1("What should clients call you?",
      "This is the name on every invite and receipt you send.")}
<div class="fld" style="margin-top:24px;max-width:420px">
  <label class="fld__l" for="nm">Your name</label>
  <input class="ctl" id="nm" style="height:44px;font-size:16px" value="{TRAINER}">
  <span class="fld__h">Use the name your clients already know you by.</span>
</div>
<div style="display:flex;align-items:center;gap:13px;margin-top:22px;padding:14px;
  border-radius:var(--tx-r2);background:var(--tx-surface-2);border:1px solid var(--tx-line);
  max-width:420px">
  <span class="av av--lg" style="background:var(--tx-av-4)">{INITIALS}</span>
  <span class="small">Clients see you as <b>{INITIALS}</b> until profile photos arrive.
    Your initials come from this field.</span></div>
{msg("", None, None)}
<p class="small" style="color:var(--tx-ink-3);max-width:62ch">This is the only answer we
  can&rsquo;t skip &mdash; a client cannot accept an invite from a blank name. Everything else
  in this flow has a Skip, and four of the {N_STEPS} steps are marked optional in the rail
  before you reach them.</p>'''


def specstep():
    on = SPECIALITIES[:SPECIALITY_CAP]
    return f'''{h1("What do you coach best?",
      f"Pick up to {SPECIALITY_CAP} &mdash; these show on your profile.")}
<div style="display:flex;align-items:center;gap:10px;margin-top:16px">
  <span class="tag tag--acc">{len(on)}/{SPECIALITY_CAP}</span>
  <span class="small" style="color:var(--tx-warn)">That&rsquo;s {SPECIALITY_CAP}. Click one of
    the chosen to swap it out.</span></div>
{chips(SPECIALITIES, on=on, cap=SPECIALITY_CAP, ghost_last=True)}
<p class="small" style="margin-top:20px;color:var(--tx-ink-3);max-width:64ch">The cap is the
  point: a trainer who &ldquo;does everything&rdquo; tells a client nothing. At the cap the rest
  drop to 38% and the line above says what a click will do &mdash; never a silently dead chip,
  which reads as a broken button.
  <br><br>The order is not alphabetical anywhere in this flow. Every list is ordered by how
  often an Indian trainer actually picks it, because the first three entries are the only ones
  most people read.</p>'''


def hoursstep():
    return f'''{h1("When do you work?",
      "Clients&rsquo; sessions are booked out of these windows, so the diary needs them before "
      "you add anybody.")}
<div class="row" style="gap:8px;margin-top:18px;flex-wrap:wrap">
  {"".join(f'<button class="chip" type="button" aria-pressed="{str(i in HOURS_DAYS).lower()}">'
           f'{SCH.DAYS[i]}</button>' for i in range(7))}
</div>
<div class="row" style="gap:14px;margin-top:18px;align-items:flex-end">
  <div class="fld" style="width:150px"><label class="fld__l">First window</label>
    <div class="row" style="gap:6px"><input class="ctl mono" value="{hm(HOURS_WIN[0][0])}"
      style="text-align:center"><span class="small">to</span>
      <input class="ctl mono" value="{hm(HOURS_WIN[0][1])}" style="text-align:center"></div></div>
  <div class="fld" style="width:150px"><label class="fld__l">Second window</label>
    <div class="row" style="gap:6px"><input class="ctl mono" value="{hm(HOURS_WIN[1][0])}"
      style="text-align:center"><span class="small">to</span>
      <input class="ctl mono" value="{hm(HOURS_WIN[1][1])}" style="text-align:center"></div></div>
  <button class="btn btn--ghost" type="button">{ic(I_PLUS, 14)}Another window</button>
</div>
<p class="micro" style="margin:24px 0 8px;color:var(--tx-ink-3)">EVERY DAY YOU PICKED, AT ONE
  PIXEL PER MINUTE</p>
<div style="overflow-x:auto">{dayband(HOURS_WIN, HOURS_DAYS)}</div>
<div class="row" style="gap:20px;margin-top:18px">
  <span class="small"><b>{dur(HOURS_MIN)}</b> a day</span>
  <span class="small"><b>{HOURS_WEEK // 60} hours</b> a week</span>
  <span class="small">{len(HOURS_DAYS)} days &middot; two windows, because a single range would
    claim you are free for lunch</span></div>
<div class="card" style="margin-top:22px;max-width:620px"><div class="card__b">
  <p style="font-size:13px;font-weight:700;color:var(--tx-ink)">If you skip this</p>
  <p class="small" style="margin-top:7px">A default week is seeded when the flow finishes, so
    the diary is never empty. The seed stands down the moment any window exists &mdash; so
    answering here replaces it rather than fighting it, and skipping is not a hole.</p>
</div></div>
<p class="small" style="margin-top:16px;color:var(--tx-ink-3);max-width:66ch">One window set,
  applied to every day you pick. Per-day differences are real but rare on day one, and the full
  per-day editor is one click from the diary &mdash; where the same table is drawn as a week and
  the price of every gap in it is computed.
  <a href="webapp-schedule.html#f-8a">See it</a>.</p>'''


def packsstep():
    rows = "".join(
        f'<tr><td class="strong">{label}</td>'
        f'<td class="num">&#8377;{total:,}</td>'
        f'<td class="num" style="color:var(--tx-accent-text)">&#8377;{each}</td>'
        f'<td style="text-align:right"><button class="btn btn--sm btn--ghost" type="button">'
        f'Edit</button></td></tr>' for label, total, each in PACKS)
    modes = "".join(
        f'<button class="card" type="button" style="text-align:left;flex:1;'
        f'border:1px solid var(--tx-{"accent-line" if i == 2 else "line"});'
        f'{"background:var(--tx-accent-soft)" if i == 2 else ""}">'
        f'<div class="card__b" style="padding:13px 14px">'
        f'<b style="display:block;font-size:13.5px;color:var(--tx-ink)">{label}</b>'
        f'<span style="display:block;font-size:12px;color:var(--tx-ink-3);margin-top:4px;'
        f'line-height:1.45">{note}</span></div></button>'
        for i, (label, note) in enumerate(WORK_MODES))
    return f'''{h1("What do you sell?",
      "A price list set now is what makes every later screen work: selling a pack becomes "
      "picking one, and &ldquo;&#8377;750 a session&rdquo; gets computed instead of guessed.")}
<p class="micro" style="margin:22px 0 9px;color:var(--tx-ink-3)">FIRST, HOW YOU WORK &mdash;
  IT DECIDES WHICH PRICE LISTS EXIST</p>
<div class="row" style="gap:10px;align-items:stretch">{modes}</div>
<p class="micro" style="margin:24px 0 9px;color:var(--tx-ink-3)">YOUR OWN PACKS</p>
<table class="tbl" style="max-width:560px"><thead><tr>
  <th>Pack</th><th style="text-align:right">Price</th>
  <th style="text-align:right">Per session</th><th></th></tr></thead>
<tbody>{rows}</tbody></table>
<button class="btn btn--secondary" type="button" style="margin-top:12px">
  {ic(I_PLUS, 14)}Add a pack</button>
<p class="small" style="margin-top:20px;color:var(--tx-ink-3);max-width:66ch">Per-session is
  computed, never typed &mdash; it is the number a client asks about and the number a trainer
  gets wrong in their head. You picked <b>Both</b>, so there are two lists: these, and the
  gym&rsquo;s own packages, which the counter sets.
  <br><br>The step is skippable and honestly so &mdash; plenty of trainers quote a number per
  client. But <b>a gym-employed trainer needs at least one named list before Continue</b>,
  because adding a client later asks who collects and then needs the matching prices.
  Skip in the rail passes on the whole step, which is a different and honest answer.</p>'''


def paystep(*, valid=True):
    if not valid:
        return f'''{h1("How should clients pay you?",
          "Your UPI ID. This is what a client sees when they pay you from their phone.")}
    <div class="fld" style="margin-top:24px;max-width:420px">
      <label class="fld__l" for="upi">UPI ID</label>
      <input class="ctl fld--err" id="upi" style="height:44px;font-size:16px;
        font-family:var(--tx-mono)" value="anbu.okhdfcbank">
    </div>
    {msg("err", I_WARN, "<b>A UPI ID has an @ in it.</b> Yours probably ends "
         + " or ".join(f"<code>{h}</code>" for h in UPI_HANDLES[:3]) + ".")}
    <p class="small" style="color:var(--tx-ink-3);max-width:62ch">The message names the
      character that is missing and the handles a trainer in India is likeliest to have,
      because &ldquo;invalid format&rdquo; sends somebody back to the same typo.</p>'''
    chips_ = "".join(
        f'<button class="chip" type="button"'
        + (' aria-pressed="true" style="background:var(--tx-accent-soft);'
           'border-color:var(--tx-accent-line);color:var(--tx-accent-text)"'
           if h == UPI_HANDLES[0] else '')
        + f'><span class="mono">{DIGITS.replace(" ", "")}{h}</span></button>'
        for h in UPI_HANDLES)
    return f'''{h1("Read this back to yourself",
      "This is where your clients&rsquo; money will go.")}
<div style="margin-top:16px;max-width:560px">
  <p class="micro">Built from your number, which we just verified</p>
  <div class="wk" style="margin-top:8px">{chips_}
    <button class="chip chip--ghost" type="button">Type a different one</button></div>
  <p class="small" style="margin-top:9px;max-width:64ch">Five chips and a way out, instead of a
    text field and a hope. The common shape in India is
    <code>&lt;phone&gt;@&lt;psp&gt;</code>, and the phone is the one string this product has just
    proved correct by sending a code to it &mdash; so the typo surface for the majority case is
    a handle, not eleven characters.</p>
</div>
<div class="card card--acc" style="margin-top:22px;max-width:520px"><div class="card__b">
  <p class="micro" style="color:var(--tx-accent-text)">YOUR UPI ID</p>
  <p class="mono" style="font-size:21px;font-weight:600;color:var(--tx-ink);margin-top:9px;
    letter-spacing:.01em">{UPI}</p>
</div></div>
<div class="msg msg--warn" style="margin-top:16px;max-width:66ch">{ic(I_WARN, 15)}<span>
  <b>We checked the shape, not the account.</b> We are not calling a payment provider, so we
  cannot confirm this account exists or that it is yours. One wrong letter passes this check and
  sends your money to a stranger.</span></div>
<button class="btn btn--secondary btn--lg" type="button" style="margin-top:8px">
  {ic(I_RUPEE, 15)}Send yourself &#8377;1 to prove it</button>
<p class="small" style="margin-top:14px;color:var(--tx-ink-3);max-width:66ch">A one-rupee
  self-transfer is the only proof available to us today, so it is offered rather than implied.
  The day a provider is wired in, this read-back is replaced by a <b>name lookup</b> &mdash;
  not softened into the word &ldquo;verified&rdquo;. And it runs <b>again at the first
  collection</b>, with the amount beside it: caught before a &#8377;9,600 collect a wrong ID is
  an edit, caught after it is somebody else&rsquo;s money. &sect;16.</p>'''


def donestep():
    items = "".join(
        f'<div class="kv"><span class="kv__k">'
        f'<span style="display:inline-grid;place-items:center;width:16px;height:16px;'
        f'border-radius:var(--tx-r1);margin-right:8px;vertical-align:-3px;'
        f'background:var(--tx-{"accent" if done else "surface-3"});'
        f'color:var(--tx-accent-ink)">{ic(I_CHECK, 10) if done else ""}</span>{label}</span>'
        f'<span class="kv__v {"ink3" if not done else ""}">'
        f'{"Done" if done else f"+{w}%"}</span></div>'
        for label, w, done in METER)
    return f'''{h1(f"You&rsquo;re set up, {FIRST}",
      "Your first client is the next thing worth doing.")}
<div class="card" style="margin-top:22px;max-width:520px"><div class="card__b">
  <div class="row" style="justify-content:space-between;align-items:baseline">
    <span class="card__t">Your profile</span>
    <span class="mono" style="font-size:19px;font-weight:600;color:var(--tx-accent-text)">
      {METER_PCT}%</span></div>
  <div class="meter meter--lg mt3"><i style="width:{METER_PCT}%"></i></div>
  <div style="margin-top:14px">{items}</div>
  <p class="small mt3" style="color:var(--tx-ink-3)">{METER_WHY}</p>
</div></div>
<div class="row" style="gap:10px;margin-top:20px">
  <button class="btn btn--primary btn--lg" type="button">{ic(I_PLUS, 15)}Add your first
    client</button>
  <button class="btn btn--secondary btn--lg" type="button">Go to today</button></div>
<p class="small" style="margin-top:18px;color:var(--tx-ink-3);max-width:66ch"><b>No
  confetti.</b> Finishing a form is not an achievement &mdash; the celebration belongs to the
  first booking and the first payment, and spending it here devalues both.
  <br><br>The meter opens at <b>{METER_PCT}%</b> rather than at zero, because anyone reaching
  this screen has finished the flow and the work is already done. The items are weighted by what
  they are worth, not counted: a UPI ID is <b>{METER[3][1] // METER[2][1]}&times;</b> a
  certification, because it is the difference between getting paid through the app and not.</p>'''


# ══════════════════════════════════════════════ the other half of signing in ══
# §09 of the mobile design, and its opening sentence is the reason this screen
# is in an auth document rather than a settings one: "This is the most dangerous
# interaction in the whole app and it is invisible on a screen."
from gen_rail import rail   # noqa: E402

DEVICES = [
    ("This browser", "Chrome on Windows &middot; Adyar", "active now", "current", 0),
    ("iPhone 15", "Chennai &middot; 4 minutes ago", "", "", 0),
    ("Galaxy S24", "Chennai &middot; 2 minutes ago", "", "", 0),
    ("Redmi Note 12", "Coimbatore &middot; 6 days ago", "", "stale", 4),
]
UNSYNCED = 4          # what the stale phone is still holding
assert DEVICES[-1][4] == UNSYNCED


def devices_screen(*, confirm=False):
    rows = []
    for name, where, when, tone, pend in DEVICES:
        if tone == "current":
            right = '<span class="tag tag--acc">This one</span>'
        else:
            right = (f'<button class="btn btn--sm btn--secondary" type="button">'
                     f'Sign out</button>')
        # The pending count goes in the RIGHT slot, not inside .lrow__t: that
        # class is nowrap + ellipsis, so a tag appended to the title was
        # clipped mid-word — "4 not uploa". Status belongs beside the control
        # it qualifies anyway.
        warn = (f'<span class="tag tag--warn">{pend} not uploaded</span>' if pend else '')
        rows.append(
            f'<div class="lrow" style="min-height:58px">'
            f'{ic(I_DESK if "browser" in name else I_PHONE, 18)}'
            f'<span class="lrow__m"><span class="lrow__t">{name}</span>'
            f'<span class="lrow__s">{where}</span></span>'
            f'<span class="lrow__r">{warn}{right}</span></div>')
    modal = ''
    if confirm:
        modal = f'''<div class="scrim scrim--top"></div>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="so-t">
      <div class="modal__hd"><p class="modal__t" id="so-t">Sign out the Redmi Note 12?</p></div>
      <div class="modal__body">
        <p style="font-size:13.5px;line-height:1.6;color:var(--tx-ink-2)">
          <b style="color:var(--tx-ink)">{UNSYNCED} things on that phone have not reached the
          server yet</b> &mdash; 3 workouts and 1 payment. We push them first. That needs a
          connection on <i>that</i> phone and takes a few seconds.</p>
        <div class="msg msg--warn" style="margin-top:12px">{ic(I_WARN, 15)}<span>If the push
          fails we will <b>refuse the sign-out</b> rather than go ahead. Signing a device out
          never deletes what is on it.</span></div>
      </div>
      <div class="modal__foot"><button class="btn btn--ghost" type="button">Cancel</button>
        <button class="btn btn--primary" type="button">Upload, then sign out</button></div>
    </div>'''
    return f'''<div class="app" data-theme="dark">{rail("settings")}
<header class="top"><nav class="crumbs" aria-label="Breadcrumb">
  <a href="/settings">Settings</a>{ic(I_CHEV, 12)}<b>Devices</b></nav>
  <div class="omni">{ic(I_SEARCH, 15)}<span>Search clients, sessions, exercises&hellip;</span>
    <kbd>&#8984;K</kbd></div>
  <div class="top__acts"><span class="sync"><i></i>Synced</span></div></header>
<main class="main"><div class="ph"><div class="ph__row">
  <div><p class="ph__t">Devices</p>
    <p class="ph__sub">Signed in on {len(DEVICES)} devices. Sign out any you do not
      recognise.</p></div>
  <div class="ph__acts"><button class="btn btn--secondary" type="button">Sign out everywhere
    else</button></div></div></div>
<div class="body">
  <div class="card"><div class="card__b card__b--flush">{"".join(rows)}</div></div>
  <div class="grid2 mt4" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px">
    <div class="card"><div class="card__b">
      <p class="micro" style="color:var(--tx-danger)">THE RULE THAT PROTECTS A SESSION</p>
      <p class="h5" style="margin:8px 0 6px;line-height:1.45">Never wipe local data on a
        401.</p>
      <p style="font-size:13px;line-height:1.6;color:var(--tx-ink-2)">Token revocation is a
        sync-permission event, not a data-lifecycle event. A trainer logs a full session in a
        basement with no signal, signs in on a new phone that evening, and a naive logout
        handler on the old one turns a 401 into an erased session. Quarantine the outbox and
        show it &mdash; never delete it.</p></div></div>
    <div class="card"><div class="card__b">
      <p class="micro" style="color:var(--tx-accent-text)">AND WHY THE LIST IS LONG</p>
      <p class="h5" style="margin:8px 0 6px;line-height:1.45">Concurrent sessions are allowed on
        purpose.</p>
      <p style="font-size:13px;line-height:1.6;color:var(--tx-ink-2)">A single-session login
        would be actively harmful here: the phone on the floor and the browser at the desk are
        both real, at the same time, every day. New-device sign-in completes normally and the
        others get told out of band &mdash; an interstitial is reserved for a new device in a
        new country.</p></div></div>
  </div>
</div></main>{modal}</div>'''


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
    <div class="viewport__in">{browser(url, app)}</div>
  </div>
  <p class="unit__note">{note}</p>
</section>'''


def units(*s):
    return '<div class="units">' + "".join(s) + '</div>'


F1A = authshell(phone_screen())
F1B = authshell(otp_screen("wrong", typed=CODE_WRONG, left=MAX_ATTEMPTS - 1))
F1C = authshell(otp_screen("idle", typed="", second=True))
F2A = authshell(role_screen(),
                quote="A person can be both. The product should not make them choose an account.")
F3A = authshell(unknown_screen(),
                quote="Trainers create clients. So the likeliest first launch is a client whose "
                      "trainer has not added them yet.")
F3B = authshell(invite_screen(),
                quote="Being typed into somebody&rsquo;s roster is a claim, not a relationship.")
F4A = setupshell("name", preflight(), done=[],
                 foot='<span class="sp"></span>'
                      '<button class="btn btn--primary btn--lg" type="button">Start</button>')
F4B = setupshell("certifications", resume(), done=["name", "experience", "specialities"],
                 foot='<button class="btn btn--ghost" type="button">Finish the rest later</button>'
                      '<span class="sp"></span>'
                      '<button class="btn btn--ghost" type="button">Skip for now</button>'
                      '<button class="btn btn--primary btn--lg" type="button">Continue '
                      'setup</button>')
F5A = setupshell("name", namestep(), done=[],
                 foot='<span class="sp"></span>'
                      '<button class="btn btn--primary btn--lg" type="button">Continue</button>')
F5B = setupshell("specialities", specstep(), done=["name", "experience"])
F5C = setupshell("hours", hoursstep(),
                 done=["name", "experience", "specialities", "certifications", "languages"])
F5D = setupshell("packs", packsstep(),
                 done=["name", "experience", "specialities", "certifications", "languages",
                       "hours"])
F5E = setupshell("payment", paystep(),
                 done=["name", "experience", "specialities", "certifications", "languages",
                       "hours", "packs"],
                 foot='<button class="btn btn--ghost" type="button">Back</button>'
                      '<span class="sp"></span>'
                      '<button class="btn btn--ghost" type="button">Skip for now</button>'
                      '<button class="btn btn--primary btn--lg" type="button">Finish</button>')
F6A = authshell(donestep(), quote="No confetti. The celebration belongs to the first booking "
                                  "and the first payment.")
F7A = devices_screen(confirm=True)

FRAMES = ["1a", "1b", "1c", "2a", "3a", "3b", "4a", "4b", "5a", "5b", "5c", "5d", "5e",
          "6a", "7a"]
N_FRAMES = len(FRAMES)
assert N_FRAMES == 15


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


STALE_FRAMES = 4
N_IDENTITY = 5

# The two lists, side by side. Built as a variable rather than spliced into an
# f-string: the findings below carry triple-quoted prose, and nesting that
# inside an outer f-string is how the first version of this block failed to
# parse at all.
_OLD = "".join(f"<li>{s}</li>" for s in STALE_STEPS)
_NEW = "".join(
    f'<li>{label}' + (' <span class="ink3">optional</span>' if key in OPTIONAL else '')
    + '</li>' for key, label, _ in STEPS)

S01_HEAD = f'''<p class="note">Nine things. The first is why this file was rewritten rather than
extended: the half of it about onboarding documented a flow that does not exist.</p>

<div class="dd" style="margin-top:20px">
  <div class="dd__i dd__i--no"><p class="dd__k">{ic(I_NO, 13)} What the old page documented</p>
    <div class="dd__c" style="border-top:0">
      <p class="micro" style="color:var(--tx-ink-3)">SIX STEPS</p>
      <ol style="margin:9px 0 0 18px;font-size:13px;line-height:1.85;color:var(--tx-ink-2)">
        {_OLD}</ol></div></div>
  <div class="dd__i dd__i--do"><p class="dd__k">{ic(I_DO, 13)} What <code>SETUP_STEPS</code>
    ships</p>
    <div class="dd__c" style="border-top:0">
      <p class="micro" style="color:var(--tx-ink-3)">{N_STEPS} STEPS &middot; {len(OPTIONAL)}
        OPTIONAL &middot; {len(TYPED)} TYPED FIELDS</p>
      <ol style="margin:9px 0 0 18px;font-size:13px;line-height:1.85;color:var(--tx-ink-2)">
        {_NEW}</ol></div></div>
</div>

<p class="note" style="margin-top:18px"><b>Not one of the six is one of the eight.</b> Not renamed
&mdash; absent. There is no step that asks where you train, none that asks for the gym&rsquo;s
share, none that adds your first clients and none about reminders; and four the app does ask about
went unmentioned: <b>specialities</b>, <b>certifications</b>, <b>languages</b> and <b>what you
sell</b>. The set has been quoting an onboarding flow somebody imagined.</p>'''


FIND = []
FIND.append(finding(
    "01", "The setup wizard documented a flow that does not exist", "danger",
    "Six steps, and the comparison above is the whole finding. The one that matters most is "
    "<b>&ldquo;The gym&rsquo;s share&rdquo;</b> as step 3, defended with &ldquo;asked late, it "
    "makes every earlier screen wrong&rdquo;. The app does not ask it in setup at all, and "
    "deliberately: <code>PacksScreen</code>&rsquo;s own docstring says the work mode is &ldquo;a "
    "defaults hint, <b>never a gate</b>: who actually collects, and the gym&rsquo;s share, are "
    "still decided <b>per client</b> at add-client time, because the mix changes month to "
    "month&rdquo;.",
    "<code>app/src/setup/draft.ts</code> exports <code>SETUP_STEPS</code> and "
    "<code>STEP_LABELS</code>; there are eight of each, and this page imports both lists rather "
    "than retyping them. <code>ls app/src/screens/setup/</code> returns ten files &mdash; the "
    "eight plus <code>PreflightScreen</code> and <code>DoneScreen</code>. The mobile design "
    "document says six, which is what it was when it was drawn; <b>hours</b> and <b>packs</b> "
    "were added to the app afterwards and the web was never told."))
FIND.append(finding(
    "02", "It promised the code would arrive on WhatsApp", "danger",
    "&ldquo;We will send a six-digit code on WhatsApp&rdquo;, on the first screen, under the only "
    "button. The product cannot do that. <code>WHATSAPP_OTP_ENABLED</code> is <code>false</code> "
    "and <code>requestOtpOnWhatsApp</code> <b>throws</b> rather than quietly falling back &mdash; "
    "and its comment says why: &ldquo;so a trainer is never told to check WhatsApp for a code that "
    "went out as a text&rdquo;. The screen was doing the exact thing the API layer was written to "
    "prevent.",
    "<code>grep -n WHATSAPP_OTP_ENABLED app/src/api/auth.ts</code>. The BSP is a locked decision "
    "and it is not wired. Every frame here says <b>SMS</b>, and &sect;06 draws the WhatsApp button "
    "in its real state: present, disabled, with the reason beside it."))
FIND.append(finding(
    "03", "Six inputs for the code, and the reason given was backwards", "danger",
    "The old page drew six separate boxes and defended them: &ldquo;Six separate inputs rather "
    "than one field, <b>because a desk browser will happily autofill a six-digit code from a "
    "paired phone and a single field defeats that</b>.&rdquo; It is the other way round. "
    "<code>autocomplete=&quot;one-time-code&quot;</code> is a hint on <b>one</b> input. Six inputs "
    "are what breaks it &mdash; along with paste, with backspace across a boundary, and with a "
    "screen reader, which gets six unlabelled boxes instead of one labelled field.",
    "The mobile behaviour spec settles it in its own words, in the client-attributes row: "
    "<b>&ldquo;One real input under six slots &mdash; never six inputs.&rdquo;</b> That is what "
    "<code>.otp</code> is: one transparent input spanning the row, six <code>aria-hidden</code> "
    "slots drawn behind it, and the focus ring on the <i>slot</i> rather than on the invisible "
    "element that owns it."))
FIND.append(finding(
    "04", "Three different failures were drawn as one", "danger",
    "<code>/v1/auth/otp/verify</code> answers three ways and each owes a different recovery. The "
    "old OTP frame had one state and one control &mdash; <i>Resend in 0:24</i>. A wrong code, an "
    "expired code and a locked number are not the same event, and <b>two of the three are not the "
    "trainer&rsquo;s fault</b>.",
    "The comment block above <code>readOtpFailure</code> tabulates them: <code>422 OTP_WRONG</code> "
    "with <code>attemptsLeft</code>, <code>410 OTP_EXPIRED</code>, <code>429 OTP_LOCKED</code> "
    "with <code>retryAfterSeconds</code>. And a fourth on the <i>request</i> endpoint: "
    "<code>OTP_THROTTLED</code>, which is the send rate rather than a wrong code and &ldquo;belongs "
    "inline on the screen they are already on&rdquo;. Four states, benched in &sect;05."))
FIND.append(finding(
    "05", f"{N_IDENTITY} identity states ship, and none was drawn", "danger",
    "<code>app/src/screens/auth/</code> holds eight screens. The old page drew the phone, the code "
    "and the role chooser. The other five decide whether somebody gets in at all &mdash; number "
    "not recognised, invited, paused, removed, and a client with nobody. The first is, by the "
    "mobile design&rsquo;s own argument, <b>the most likely first experience in the whole "
    "product</b>: trainers create clients, so a client who opens the app before their trainer "
    "adds them lands there.",
    "<code>UnknownScreen</code>, <code>InviteScreen</code>, <code>PausedScreen</code>, "
    "<code>RemovedScreen</code>, <code>UnattachedScreen</code> &mdash; and the <code>Role</code> "
    "union in <code>api/auth.ts</code>, which has nine members. &sect;08 draws two as frames and "
    "three as a bench, because three of them are the same shape: one sentence, one name, one date, "
    "one action."))
FIND.append(finding(
    "06", "None of the limits was on any screen", "danger",
    f"A trainer can get {MAX_ATTEMPTS} codes wrong, then the number is locked for {LOCK_MIN} "
    f"minutes. They can ask for {MAX_SENDS_DAY} codes a day and no more. A code lasts "
    f"{CODE_TTL_MIN} minutes. All three are enforced on the server and not one appeared anywhere "
    f"in the design set &mdash; so the first time a trainer meets any of them, it is as an "
    f"unexplained refusal.",
    f"<code>backend/src/main/resources/application.yml</code>, <code>app.otp</code>: "
    f"<code>max-attempts: {MAX_ATTEMPTS}</code>, <code>lock-minutes: {LOCK_MIN}</code>, "
    f"<code>expiry-minutes: {CODE_TTL_MIN}</code>, "
    f"<code>max-sends-per-day: {MAX_SENDS_DAY}</code>, "
    f"<code>resend-ladder-seconds: {list(RESEND_LADDER)}</code>. This page imports the same "
    f"numbers and asserts them; &sect;03 tabulates all three copies."))
FIND.append(finding(
    "07", "The most dangerous interaction in the product is in no file", "danger",
    "&sect;09 of the mobile design opens: <b>&ldquo;This is the most dangerous interaction in the "
    "whole app and it is invisible on a screen.&rdquo;</b> A trainer logs a full session in a "
    "basement with no signal; that evening they sign in somewhere else; a naive 401 handler on the "
    "old device wipes local storage and a whole session&rsquo;s sets are gone, silently, with no "
    "error anybody sees. Nothing in the web set drew the device list, the sign-out, or the rule.",
    "It matters <b>more</b> here than on the phone, not less: the browser is a third device and "
    "the one most likely to be shared. A gym&rsquo;s front-desk PC is exactly the machine somebody "
    "signs into once and never signs out of. Frame <b>7a</b>."))
FIND.append(finding(
    "08", "The best idea on the page was attached to the invented half of it", "warn",
    "The role chooser is a real screen and the note on it is correct. But the page&rsquo;s "
    "strongest single idea &mdash; type 46 and the interface immediately says &ldquo;you keep "
    "&#8377;432 of an &#8377;800 session&rdquo; &mdash; belonged to step 3, which does not exist.",
    "The idea survives, in the files that own the number: the money screen&rsquo;s stat row and "
    "the deck&rsquo;s month card both state the gym&rsquo;s share and what it leaves. What does "
    "not survive is asking for it during onboarding, before there is a client to apply it to."))

FIND.append(finding(
    "09", "Every second path into the product is unbuilt", "danger",
    "SMS in India has a 2&ndash;8% hard-fail tail, so the mobile design specified two fallback "
    "channels and a human. <b>None of the three is reachable.</b> WhatsApp has a flag that is "
    "<code>false</code>. Voice &mdash; &ldquo;Call me with the code&rdquo;, drawn in that "
    "document&rsquo;s 8b &mdash; has <b>no endpoint and no channel value</b>. And the human route "
    "is <code>disabled={!SUPPORT_WHATSAPP_NUMBER}</code>, so it is dark unless an environment "
    "variable is set.",
    "<code>OtpChannel</code> in <code>api/auth.ts</code> is <code>'sms' | 'whatsapp'</code> "
    "&mdash; two values, and one of them is behind a false flag. "
    "<code>grep -rn voice app/src/api/auth.ts</code> returns nothing. On the arithmetic above "
    "that is a few percent of trainers with no way in at all, which makes this the most "
    "consequential gap in the file. Frame <b>1c</b> draws all three in their real state rather "
    "than pretending."))

assert len(FIND) == 9
S01 = S01_HEAD + "\n\n" + "\n\n".join(FIND)


from gen_rail import pattern   # noqa: E402

S02 = '''<p class="note">Four products, and the survey produced a single sentence: <b>not one of
them can let a trainer in without an email address and a password.</b> For a trainer standing in a
gym in Adyar, the phone number is the identity and WhatsApp is the inbox &mdash; an email they check
weekly is a worse credential than a number they answer in ten seconds. That is the whole of
X&nbsp;REP&rsquo;s front door, and it is the one part of this product where the category is not
merely behind but pointed somewhere else.
<br><br>Rows marked <span class="tag tag--ok">Verified</span> trace to the vendor&rsquo;s own help
centre or sign-up page. Two help centres return 403 to a direct fetch; where a claim came from a
search summary of such a page rather than the page itself, the row says so.</p>

''' + pattern(
    "ABC Trainerize &mdash; and you cannot sign up in the app at all",
    "ok", "Verified from vendor help centre",
    '''Business name (50 characters), email address, password. A 30-day trial with no card. And the
    row that inverts this whole document: <b>&ldquo;You cannot sign up through the mobile app; you
    must visit trainerize.com on a web browser to sign up&rdquo;</b> &mdash; after which the same
    email and password open the app. Then an in-app <b>Setup Guide</b> in three journeys, Basic /
    Advanced / Studio, which cannot be completed until a test client called
    <b>Timmy&nbsp;Explorer</b> has been added.''',
    '''<b>The three journeys.</b> A trainer new to online coaching and a studio owner do not need
    the same eight questions, and offering one flow to both is what makes onboarding feel like
    paperwork to one of them. X&nbsp;REP has one flow and one audience today; the day it has two,
    this is the shape.''',
    '''<b>Signing up in a browser only</b>, and <b>Timmy Explorer</b>. The first says the phone is
    a client of the web, which is the opposite of this product &mdash; the phone is where the work
    happens and the desk is the second seat. The second is a fake person in a real roster: a
    trainer whose client list opens with somebody who does not exist has been told, in the first
    thirty seconds, that this list is not real. X&nbsp;REP&rsquo;s answer is the empty state on the
    deck, which names the one action worth taking and puts a real client at the end of it.''') + '''

''' + pattern(
    "TrueCoach &mdash; the client gets an email and makes a password",
    "ok", "Verified from vendor help centre and product pages",
    '''Trainer: name, email, password. Client: <b>the trainer types a first name, last name and
    email address</b>, an invitation email goes out, and it &ldquo;prompts them to create a
    password, sign into their account and fill out other basic information&rdquo;.''',
    '''Nothing on the mechanism. But the row is the most useful in the survey, because it shows
    what the category thinks consent is: <b>an email landing</b>. The relationship is assumed the
    moment the trainer presses Add, and the client&rsquo;s first act is to make a password for an
    arrangement nobody asked them about.''',
    '''<b>The assumption.</b> In X&nbsp;REP a trainer typing a number is a <i>claim</i>, not a
    relationship &mdash; <code>InviteScreen</code>&rsquo;s docstring says it in those words &mdash;
    and until the person on the other end answers, the token they hold opens no data at all. The
    server refuses it on both <code>/v1/sync</code> and <code>/v1/client</code>, so there is
    nothing to leak even by accident. Frame <b>3b</b>.''') + '''

''' + pattern(
    "Everfit &mdash; invite yourself",
    "ok", "Verified from vendor help centre",
    '''Coach web carries an <b>Onboarding checklist</b>, and on it a button that says
    <b>&ldquo;Invite Myself&rdquo;</b> &mdash; the coach joins their own roster as a demo client
    and sees the product from the other side. Their heavily-documented <i>Onboarding Flow</i>
    feature, six asset types, is for onboarding <b>clients</b>, not the coach.''',
    '''<b>Invite Myself.</b> It solves the same problem as Timmy Explorer and solves it honestly:
    the demo client is you, so nothing fake enters the roster and the thing you learn is what your
    clients will actually see. For X&nbsp;REP it is nearly free &mdash; a trainer who is also
    somebody&rsquo;s client is already a first-class case, and frame <b>2a</b> is the screen that
    handles it.''',
    '''<b>Building onboarding for clients while your own is a checklist.</b> Six asset types for
    the client&rsquo;s first week and a to-do list for the coach&rsquo;s first hour is an odd
    ordering of effort.''') + '''

''' + pattern(
    "The category as a whole &mdash; a password nobody needed",
    "warn", "Verified across four sign-up pages",
    '''Every product surveyed authenticates with an email address and a password, and every one of
    them therefore also ships forgot-password, reset links, password rules and the support load
    that comes with all three.''',
    '''<b>The gap itself.</b> A password is a thing to forget, and the population here is trainers
    on a gym floor with wet hands and a cracked screen. X&nbsp;REP has none: the number is the
    account, a code proves it, and the session lasts <b>until an explicit sign-out</b> so nobody is
    logged out mid-session. There is no reset flow in this file because there is nothing to
    reset.''',
    '''<b>Treating email as identity in this market.</b> And the second-order cost: an email-first
    product cannot make the trainer&rsquo;s WhatsApp the delivery channel for anything &mdash;
    which is where every nudge, receipt and weekly report in this product goes.''')

S02 += f'''

<div class="grp"><div class="grp__t"><h4>The way in, four products and this one</h4>
  <span><span class="tag tag--acc">Synthesis</span></span></div>
<table class="rt" style="width:100%">
<thead><tr><th style="width:17%">Product</th><th style="width:19%">Credential</th>
  <th style="width:12%">Password</th><th style="width:22%">How a client arrives</th>
  <th>Consent step</th></tr></thead>
<tbody>
<tr><th>ABC Trainerize</th><td>Email &middot; <b>browser only</b></td>
  <td><span class="tag tag--warn">Yes</span></td>
  <td>Invited by email</td><td>None &mdash; the email <i>is</i> the arrangement</td></tr>
<tr><th>TrueCoach</th><td>Email</td><td><span class="tag tag--warn">Yes</span></td>
  <td>Trainer types name + email; client makes a password</td>
  <td>None</td></tr>
<tr><th>Everfit</th><td>Email</td><td><span class="tag tag--warn">Yes</span></td>
  <td>Onboarding flow, or <i>Invite Myself</i></td><td>None documented</td></tr>
<tr><th>My PT Hub</th><td>Email</td><td><span class="tag tag--warn">Yes</span></td>
  <td>Not documented in reachable material</td><td>None documented</td></tr>
<tr class="dt__hl"><th>X&nbsp;REP</th><td><b>Phone &middot; {CODE_LEN}-digit SMS code</b></td>
  <td><b style="color:var(--tx-accent-text)">None</b></td>
  <td>Trainer types a number; the person answers on their own device</td>
  <td><b>A screen, with a decline that works</b></td></tr>
</tbody></table>
<p class="note" style="margin-top:16px">Three things fall out. <b>One:</b> the only product whose
sign-up is web-only is the one whose web app this document is being compared against, and it points
the wrong way for a trainer whose working device is a phone. <b>Two:</b> nobody has a consent step,
because when the credential is an email address the invitation and the account are the same object
&mdash; you cannot decline an email that already made you a user. Phone-plus-code separates them,
which is what makes {N_IDENTITY} identity states possible and necessary. <b>Three:</b> nobody
publishes an identity dead end at all. X&nbsp;REP ships five, and the reason is in the model: in a
product where <b>trainers create clients</b>, the commonest first launch is a person the system has
never heard of.</p></div>'''


S03 = f'''<p class="note">Every number a sign-in screen quotes is enforced somewhere else, which
means it exists in more than one place and can therefore drift. It exists in <b>three</b>:
<code>application.yml</code> on the server, <code>api/auth.ts</code> in the app, and the mobile
design document. Two of the three agree. This page imports the server&rsquo;s copy and asserts it,
so the next divergence breaks a build rather than a screen.</p>

<table class="rt" style="width:100%;margin-top:18px">
<thead><tr><th style="width:20%">Rule</th><th style="width:13%">Server</th>
  <th style="width:13%">The app</th><th style="width:15%">The design doc</th>
  <th>What the screen does with it</th></tr></thead>
<tbody>
<tr><th>Code length</th><td class="num">{CODE_LEN}</td><td class="num">{CODE_LEN}</td>
  <td class="num">{CODE_LEN}</td>
  <td>Six slots over one input. Numeric only, never alphanumeric.</td></tr>
<tr><th>Code lifetime</th><td class="num">{CODE_TTL_MIN} min</td>
  <td class="num">{CODE_TTL_MIN} min</td><td class="num">{CODE_TTL_MIN} min</td>
  <td>Named in the expiry message, because &ldquo;expired&rdquo; without a duration reads as
    &ldquo;broken&rdquo;.</td></tr>
<tr class="dt__hl"><th>Wrong-code limit</th>
  <td class="num"><b>{MAX_ATTEMPTS}</b></td><td class="num"><b>{MAX_ATTEMPTS}</b></td>
  <td class="num"><span class="tag tag--danger">{SPEC_ATTEMPTS}</span></td>
  <td>Counted down from the second attempt: <i>{MAX_ATTEMPTS - 1} attempts left</i>.</td></tr>
<tr class="dt__hl"><th>Lock</th>
  <td class="num"><b>{LOCK_MIN} min</b></td><td class="num"><b>{LOCK_MIN} min</b></td>
  <td class="num"><span class="tag tag--danger">{SPEC_LOCK_MIN} min</span></td>
  <td>A live countdown, from <code>retryAfterSeconds</code> rather than from the constant.</td></tr>
<tr><th>Resend ladder</th><td class="num">{RESEND_LADDER[0]}&thinsp;/&thinsp;{RESEND_LADDER[1]}&thinsp;/&thinsp;{RESEND_LADDER[2]}s</td>
  <td class="num">same</td><td class="num">same</td>
  <td>Always with a visible countdown; the second path opens after the second one.</td></tr>
<tr><th>Codes per day</th><td class="num">{MAX_SENDS_DAY}</td>
  <td class="ink3">read from the error</td><td class="ink3">absent</td>
  <td>Inline, and the copy changes with the magnitude &mdash; see below.</td></tr>
<tr><th>Send window</th><td class="num">{SEND_WINDOW_MIN} min</td>
  <td class="ink3">read from the error</td><td class="ink3">absent</td>
  <td>Same message, same slot.</td></tr>
<tr><th>Session</th><td class="num">{JWT_DAYS} days</td><td class="ink3">silent refresh</td>
  <td>until explicit sign-out</td>
  <td>Never a logout mid-session. If refresh fails, keep writing locally and retry.</td></tr>
<tr><th>WhatsApp delivery</th><td class="num">&mdash;</td>
  <td class="num"><code>false</code></td><td>from the 2nd attempt</td>
  <td>Drawn, disabled, with the reason. &sect;06.</td></tr>
</tbody></table>

<div class="why why--danger" style="max-width:none"><p class="why__k">The two rows that
disagree</p>
<p>The mobile design&rsquo;s behaviour spec says <b>&ldquo;Wrong-code limit: {SPEC_ATTEMPTS}, then a
{SPEC_LOCK_MIN}-minute lock&rdquo;</b>. The server says <b>{MAX_ATTEMPTS}</b> and
<b>{LOCK_MIN}</b>, and <code>api/auth.ts</code> follows the server. So the design document is the
copy that is wrong, and it is the copy every other file in this set has been reading &mdash; which
is how a screen ends up promising two more attempts than a trainer has.
<br><br>The rule this establishes for the set: <b>where a policy number is enforced, the enforcing
file is the source of truth</b>, and a design document that states it is a comment. Both numbers
here are imported from <code>application.yml</code>&rsquo;s values and asserted, including an
assertion that the two <i>disagree</i> &mdash; so the day somebody fixes the design doc, this page
fails and gets updated with it.</p></div>

<div class="why"><p class="why__k">And one number that is really three sentences</p>
<p><code>throttleMessage</code> in the app does something worth copying exactly: it changes its
<b>wording</b> with the magnitude of the wait, because the same sentence is a lie at two of the
three scales. Under 90 seconds it says <i>&ldquo;That&rsquo;s a lot of codes. Try again in 45
seconds.&rdquo;</i>; under 90 minutes it counts in minutes; past that it says <i>&ldquo;That&rsquo;s
too many codes for this number <b>today</b>. Try again in about 4 hours.&rdquo;</i> &mdash; because
the ladder refuses for half a minute and the day&rsquo;s ceiling of {MAX_SENDS_DAY} refuses for
hours, and &ldquo;give it a minute&rdquo; is a lie in the second case that the next attempt
exposes.</p></div>'''


def msgcell(label, tone, glyph, text):
    return (f'<div class="cell" style="align-self:stretch"><span class="cell__l">{label}</span>'
            f'<div style="width:100%;padding:12px 14px;border-radius:var(--tx-r2);'
            f'background:var(--tx-surface);border:1px solid var(--tx-line)">'
            f'{msg(tone, glyph, text)}</div></div>')


MSG_BENCH = (
    '<div class="bench" style="overflow-x:auto"><div class="bench__col" '
    'style="min-width:560px;max-width:720px;gap:16px">'
    + msgcell("AT REST &middot; THE SLOT IS STILL THERE", "", None, "")
    + msgcell(f"422 &middot; OTP_WRONG &middot; SPENDS AN ATTEMPT", "err", I_WARN,
              f"<b>That code is wrong.</b> {MAX_ATTEMPTS - 1} attempts left before this number is "
              f"locked for {LOCK_MIN} minutes.")
    + msgcell("410 &middot; OTP_EXPIRED &middot; SPENDS NOTHING", "warn", I_CLOCK,
              f"<b>That code has expired.</b> Codes last {CODE_TTL_MIN} minutes. This one cost you "
              f"nothing &mdash; send another.")
    + msgcell("429 &middot; OTP_LOCKED &middot; A COUNTDOWN, NOT A REFUSAL", "err", I_LOCK,
              f"<b>Too many wrong codes.</b> This number is locked for 9:08.")
    + msgcell("429 &middot; OTP_THROTTLED &middot; TOO MANY ASKED FOR, NOT TOO MANY WRONG",
              "warn", I_CLOCK,
              "<b>That&rsquo;s a lot of codes.</b> Try again in 45 seconds.")
    + msgcell("AND THE ONE NOBODY DESIGNS", "ok", I_CHECK, "<b>New code sent.</b>")
    + '</div></div>')

WALL_BENCH = (
    '<div class="bench" style="overflow-x:auto"><div class="bench__row" '
    'style="align-items:stretch;flex-wrap:nowrap;gap:18px;min-width:1180px">'
    + "".join(
        f'<div class="cell"><span class="cell__l">{lab}</span>'
        f'<div style="width:372px;background:var(--tx-surface);border:1px solid var(--tx-line);'
        f'border-radius:var(--tx-r3);padding:22px 24px">{wall_screen(k)}</div></div>'
        for k, lab in (("paused", "7b &middot; PAUSED"),
                       ("removed", "7d &middot; REMOVED &middot; SHOWN ONCE"),
                       ("unattached", "7e &middot; A CLIENT WITH NOBODY")))
    + '</div></div>')

S04 = f'''<p class="note">One field, one button, and the headline <b>is</b> the field&rsquo;s label
&mdash; there is no caption above the box repeating it, which is the app&rsquo;s own note and the
reason the input is labelled by an <code>h2</code>. The button is dead until ten digits are present,
so nobody presses it early and reads an error they caused by being early.</p>

{units(frame("1a", "The number", "login &middot; 1a 1b 1c", "/sign-in", F1A,
  f'''<b>The rule is the server&rsquo;s, not a length check.</b> The field accepts
  <code>^[6-9]\\d{{9}}$</code> &mdash; the same regex as <code>AuthController.OtpRequestBody</code>
  &mdash; and the app&rsquo;s comment explains why counting digits was not enough: a number
  starting 5 reached the network, and the server&rsquo;s 400 came back as &ldquo;couldn&rsquo;t
  send the code. Try again.&rdquo; That names nothing, blames the connection for a typo, and invites
  the same number again. TRAI allocates only the 6, 7, 8 and 9 series to mobile, so a number outside
  them can never receive an SMS and there is nothing to retry.
  <br><br><b>The trust line is not decoration.</b> The mobile spec has a row headed <i>never do
  this</i>, and its content is this sentence: OTP-relay fraud over phone calls is common in India,
  and the product should say plainly that it will never ring and ask. So it gets a ruled box and a
  lock rather than grey text under a button, because grey text under a button is text nobody reads.
  <br><br><b>And the offline caveat belongs here and only here.</b> Signing in is the single action
  in this product that cannot work without a connection. Every other screen in the set writes to
  the browser first &mdash; which is why this is the one screen that says so.'''))}'''

S05 = f'''<p class="note">One screen, and the only things that change between its states are the
message slot and the foot. That is the argument for a bench rather than five frames &mdash; and for
the slot being <b>always present</b>, keeping its height whether or not it holds anything, so
nothing below it moves when a code is refused.</p>

{units(frame("1b", "A wrong code &mdash; and the digits stay", "login &middot; 3a",
  "/sign-in/verify", F1B,
  f'''<b>The digits are kept.</b> One was mistyped; clearing all six is, in the mobile
  spec&rsquo;s words, &ldquo;the most-complained-about OTP behaviour there is&rdquo;. So the field
  keeps its contents, the boxes take the danger edge, and <b>Verify</b> stays live &mdash; the fix
  is one keystroke and the screen should not make it six.
  <br><br><b>The count is a warning, not a score.</b> It appears from
  {ATTEMPTS_WARN_FROM} remaining onward, which on a limit of {MAX_ATTEMPTS} means from the first
  mistake &mdash; warn before the wall, not at it. And it names what the wall <i>is</i>:
  {LOCK_MIN} minutes, for this number.
  <br><br><b>One real input, six drawn slots.</b> The input spans the row, is transparent, and
  carries <code>autocomplete="one-time-code"</code>, <code>inputmode="numeric"</code> and
  <code>pattern="\\d{{{CODE_LEN}}}"</code>; the slots are <code>aria-hidden</code>. A screen reader
  gets one field labelled by the headline. The caret is the slot with the focus ring, because a text
  cursor inside a 52px box reads as a cursor in the wrong place.'''))}

<div class="grp"><div class="grp__t"><h4>Four refusals, four recoveries</h4>
  <span><span class="tag tag--acc">The message slot</span></span></div>
<p class="note" style="margin-top:0">Two of these four are not the trainer&rsquo;s fault, and one of
those two is the reason this bench exists. <b>An expired code is amber, not red.</b> It is the
clock&rsquo;s doing, it spends no attempt, and styling it as an error is NN/g&rsquo;s third hostile
pattern &mdash; error treatment on a message that reports no error. The set&rsquo;s own tokens make
that easy and the old page threw the distinction away by having one state.</p>
{MSG_BENCH}
<table class="rt" style="width:100%;margin-top:20px">
<thead><tr><th style="width:8%">Status</th><th style="width:16%">code</th>
  <th style="width:16%">Carries</th><th style="width:9%">Tone</th>
  <th>The recovery it owes</th></tr></thead>
<tbody>''' + "".join(
    f'<tr><th class="mono">{st}</th><td><code>{code}</code></td>'
    f'<td class="mono ink3">{carries}</td>'
    f'<td><span class="tag tag--{"danger" if kind in ("wrong", "locked") else "warn"}">'
    f'{"error" if kind in ("wrong", "locked") else "warning"}</span></td>'
    f'<td>{why}</td></tr>' for st, code, carries, kind, why in FAILURES) + '''</tbody></table>
<p class="note" style="margin-top:16px"><b>Both 429s are on the same endpoint and mean opposite
things.</b> <code>OTP_LOCKED</code> is three wrong codes and owes a countdown; <code>OTP_THROTTLED</code>
is the send rate and owes an inline line on the screen the trainer is already on. Classifying on the
status alone &mdash; which is what a naive handler does &mdash; turns a 30-second wait into a
ten-minute lockout screen. The app insists on the <code>code</code> field for exactly this, and
falls back to the status only for a proxy that strips the body.</p></div>'''


S06 = f'''<p class="note">There is no credible published OTP delivery figure for India &mdash; every
&ldquo;99.9%&rdquo; is vendor marketing. Vendor material in 2026 puts transactional SMS at
<b>92&ndash;98%</b>, which is another way of writing a <b>2&ndash;8% hard-fail tail</b>, and the
honest latency assumption is 5&ndash;15s at p50 and 30&ndash;60s+ at p95. So the code can never be
the only path, and the resend button can never be the only recovery.</p>

{units(frame("1c", "When the SMS does not arrive", "login &middot; 8a 8b 8c",
  "/sign-in/verify", F1C,
  f'''<b>The second path opens after the second resend</b>, not on the first, and the ladder is what
  paces it: {RESEND_LADDER[0]}s, then {RESEND_LADDER[1]}s, then {RESEND_LADDER[2]}s, always with a
  visible countdown. Without an explicit <i>New code sent</i> confirmation people press resend three
  more times, burn the day&rsquo;s ceiling of {MAX_SENDS_DAY} and land in a lockout for no reason
  &mdash; so the confirmation is a state of the message slot rather than a toast.
  <br><br><b>Voice OTP is the control nobody ships and it recovers a real slice.</b> Dual-SIM
  confusion, DND filters and a number mid-port all kill an SMS and none of them kills a call. It is
  live here.
  <br><br><b>All three second paths are drawn, and two of them do not exist.</b> WhatsApp has a
  flag that is <code>false</code>. Voice &mdash; the control the mobile design put in its 8b, and
  the one most products skip &mdash; has <b>no endpoint and no channel value</b>:
  <code>OtpChannel</code> is <code>sms | whatsapp</code>. Only the third works, and it is a person.
  They are drawn because deleting them would hide two decisions, and labelled
  <i>not wired</i> and <i>no endpoint</i> because a live button that cannot work is worse than a
  dead one that says so &mdash; the same treatment the offline frame on
  <a href="webapp-dashboard.html#f-3a">Today</a> gives a nudge with no connection.
  <br><br><b>On the arithmetic above, that is a few percent of trainers with no way in at all.</b>
  Dual-SIM confusion, DND filters and a number mid-port all kill an SMS and none of them kills a
  call, so voice is the one that would recover the most &mdash; and it is the one with nothing
  behind it. Finding 09, and the first row of &sect;16.
  <br><br><b>And one correction to the mobile spec, from the 2026 numbers.</b> That document calls
  WhatsApp &ldquo;the reliable second path&rdquo;. It is the <i>faster</i> path &mdash; under two
  seconds to an active user &mdash; but it reaches only <b>70&ndash;85%</b> of a base, because it
  needs the app installed and the user opted in. Faster and narrower is a good second path and a bad
  first one, which is what §08 of that document already does; the reasoning should say
  <i>narrower</i> rather than <i>more reliable</i>.'''))}'''

S07 = f'''<p class="note">The hardest onboarding case in this product is a genuine one and it is not
an edge: a trainer who is also somebody else&rsquo;s client. The app never asks them to keep two
logins.</p>

{units(frame("2a", "Which book", "login &middot; 5a", "/sign-in/role", F2A,
  f'''<b>Both cards are real and both are the same size.</b> The trainer card is the default
  &mdash; <code>Role</code>&rsquo;s own comment says trainer is &ldquo;the default lens even for
  somebody who is also a client, because coaching is what they signed up to do&rdquo; &mdash; and
  the accent ring says which one Enter takes, not which one is allowed.
  <br><br><b>The greeting is by first name and it is the only greeting in the product.</b>
  <i>Welcome back, {FIRST}</i> is on this screen because by now the server has answered with
  <code>trainerName</code>; the deck deliberately has none, and the setup flow deliberately has none
  either, because at that point all the code has given us is a phone number. One greeting, at the
  one moment the product actually knows something.
  <br><br><b>And the switch does not disappear.</b> It lives in the rail foot afterwards, which is
  the whole reason this screen is a choice of <i>where to land</i> rather than a choice of
  account.'''))}'''

S08 = f'''<p class="note">Nine values in the <code>Role</code> union, {N_IDENTITY} of them screens.
This is the part of the product the category does not have at all &mdash; and it exists because of
one structural fact: <b>trainers create clients</b>. A person can therefore meet this product
before it has heard of them, or after somebody has typed their number without asking, or after
somebody has ended it. None of those is an error state and all three used to be a spinner.</p>

{units(
 frame("3a", "We do not know this number", "login &middot; 7a", "/sign-in/new", F3A,
  f'''<b>Two exits, and neither is a dead end.</b> This is the likeliest first launch in the whole
  product: a client downloads the app, types their number, and their trainer has not added them yet
  &mdash; or added a different number. Without this screen they are at a spinner, and the mobile
  design calls that &ldquo;the single most common way a coaching app loses a client on day
  one&rdquo;.
  <br><br><b>It appears after the code, never before.</b> Answering &ldquo;is this number
  known?&rdquo; before somebody has proved they own it hands anybody the customer list, one number
  at a time. So the screen costs a verification to reach, and the note on it says so rather than
  leaving it to be inferred.
  <br><br><b>And this is where a trainer account is created &mdash; not at sign-in.</b> Verifying
  used to mint one for any number, which quietly handed a coaching workspace to every client who
  tried the app before their trainer got round to it. <code>claimTrainerAccount</code> now takes the
  pending token explicitly and is called from here, and the third line on the screen &mdash;
  <i>typed it wrong?</i> &mdash; is there because one wrong digit produces exactly this screen and
  looks exactly like being a new user.'''),
 frame("3b", "Somebody added you", "login &middot; 7c", "/invite/&hellip;", F3B,
  f'''<b>Being typed into a roster is a claim, not a relationship.</b> Until this screen is
  answered there is a person in the database who has never heard of us, and what they are agreeing
  to is not trivial: from the moment they accept, their trainer sees every set they log, every
  weight they record and every session they keep or miss. So it is a screen, and the three things
  are listed rather than summarised.
  <br><br><b>Decline is the same size as Accept.</b> Not a link in a corner &mdash; the same
  footer, the same weight. An accept that is the only way off the screen is not consent, and the
  note under the buttons says that in one sentence rather than leaving it as a layout accident.
  <br><br><b>There is no training data on this screen and there cannot be.</b> The token behind it
  opens no sync scope; the server refuses it on both <code>/v1/sync</code> and
  <code>/v1/client</code>. The trainer&rsquo;s name and gym come from the sign-in response itself,
  which is the least that can be shown and still let somebody tell whether they recognise who is
  asking.'''))}

<div class="grp"><div class="grp__t"><h4>Three walls, one shape</h4>
  <span><span class="tag tag--acc">7b &middot; 7d &middot; 7e</span></span></div>
<p class="note" style="margin-top:0">These three are a sentence, a name, a date and one action, and
they are benched rather than framed for that reason. What makes them work is not layout &mdash; it is
that each one names <b>who</b> and <b>when</b>, and sends the person to the human who can undo it
rather than to us.</p>
{WALL_BENCH}
<table class="rt" style="width:100%;margin-top:20px">
<thead><tr><th style="width:15%">State</th><th style="width:26%">Reached by</th>
  <th>The one thing it must not get wrong</th></tr></thead>
<tbody>
<tr><th>7b &middot; paused</th><td>Every roster this number is on is paused</td>
  <td><b>Paused is not deleted</b>, in those words. Nothing logged has been removed, and it all
    comes back. FR-1 has pause <i>and</i> soft delete, so both owe an answer at sign-in.</td></tr>
<tr><th>7d &middot; removed</th><td>A trainer ended it and this person has not been told</td>
  <td><b>It shows once.</b> The membership row outlives the membership on purpose &mdash; the
    trainer&rsquo;s payments and session history point at it &mdash; so <code>removed</code> stays
    true forever, and without the acknowledgement this screen would be the app for the rest of time.
    The local wipe runs <b>after</b> the ack lands, never before: a wipe against a server that never
    got the message erases the data <i>and</i> shows the screen again.</td></tr>
<tr><th>7e &middot; unattached</th><td>Declining the only invite, acknowledging the only removal, or
    signing in later with every membership already answered</td>
  <td><b>No &ldquo;I&rsquo;m a trainer&rdquo; button.</b> That is 7a&rsquo;s exit and it is wrong
    here: this number&rsquo;s role is already client, so the door would either fail at the server or
    quietly convert somebody who declined one invite into a trainer with an empty roster. Same dead
    end, different reason, so it gets its own screen with the honest sentence and no misleading
    second option.</td></tr>
</tbody></table></div>'''


S09 = f'''<p class="note">{N_STEPS} steps, {len(TYPED)} typed fields in the app &mdash; and one on
the web, because &sect;16&rsquo;s picker takes the majority case of the UPI ID off the keyboard
altogether. Name
and UPI ID &mdash; and everything else a click. {len(OPTIONAL)} of the {N_STEPS} are optional and the
rail says which <b>before</b> you reach them, because the most-named onboarding complaint across
every platform in the app&rsquo;s own teardown was not form length. It was <b>surprise</b>: being
asked for things nobody warned you about.</p>

{units(
 frame("4a", "What we will ask", "setup &middot; 1a", "/setup", F4A,
  f'''<b>A pre-flight screen costs one click and prevents the worst review you will get.</b> That is
  the app&rsquo;s own justification and the evidence behind it is a quote from a competitor&rsquo;s
  trainer: &ldquo;I wasn&rsquo;t made aware of all the things they would require from me before they
  could launch my platform.&rdquo;
  <br><br><b>There is no greeting, and its absence is deliberate.</b> All the code has given us is
  a phone number &mdash; we learn the name on the very next screen. A screen that said
  <i>Welcome!</i> here would be greeting nobody.
  <br><br><b>Five lines, not eight.</b> The eight steps are on the rail; the body groups them into
  the five things a trainer would recognise as questions, with the optional ones marked as optional
  in the same breath. And the last line is the offline promise, stated before anything is asked
  rather than after &mdash; which on the web has a wrinkle the phone does not have, and &sect;10
  covers it.'''),
 frame("4b", "Coming back to a half-finished flow", "setup &middot; 1b", "/setup/certifications",
  F4B,
  f'''<b>The rail carries the answers, which is what makes it a record rather than a progress
  bar.</b> Three steps done, each showing what was said; the next one lit; the rest receding. And
  because the rail is already the progress indicator there is no bar as well &mdash; two progress
  systems for one flow is the mistake the mobile design names by name.
  <br><br><b>Time remaining lives in the subtitle</b>, not in a widget. &ldquo;About 40 seconds
  left&rdquo; is a claim the flow can actually keep, because {len(TYPED)} of the {N_STEPS} steps
  involve typing.
  <br><br><b>Every step is addressable and the back button works.</b> <code>/setup/name</code> to
  <code>/setup/payment</code>, one route each, so a refresh mid-flow lands where it left off and a
  rail row is a link rather than a state change. The IA committed to this for six steps; there are
  eight.'''))}'''

S10 = f'''<p class="note">Five of the eight steps are the same question a desk asks slightly better.
Three are different enough to draw, and one of them is the reason a trainer would do this on a laptop
at all.</p>

{units(
 frame("5a", "Step 1 &middot; the only answer that cannot be skipped", "setup &middot; 2a 2b",
  "/setup/name", F5A,
  f'''<b>The initials preview earns its place.</b> Profile photos are not in the MVP, so this screen
  is one input &mdash; and the initials do the work an avatar would, derived live from the field and
  shown back, so the trainer knows what a client will actually see. It shows what the name is
  <i>for</i> rather than just collecting it.
  <br><br><b>And the validation names the reason, not the rule.</b> When it is empty the message is
  <i>&ldquo;your name is the one thing we can&rsquo;t skip&rdquo;</i> &mdash; because a client
  receiving an invite has to see who it is from. Not &ldquo;required&rdquo;, not an asterisk, and no
  red outline before the field has been left: NN/g&rsquo;s second and first hostile patterns
  respectively, and the app avoided both before this page did.'''),
 frame("5b", "Step 3 &middot; at the cap", "setup &middot; 3b 3c", "/setup/specialities", F5B,
  f'''<b>The cap is the point.</b> A trainer who &ldquo;does everything&rdquo; tells a client
  nothing, so it is {SPECIALITY_CAP} of {len(SPECIALITIES)} and the counter is live. At the cap the
  unpicked chips drop to 38% and the line above says what a click will now do &mdash; swap, not
  add. <b>Never a silently dead chip</b>, which reads as a broken button.
  <br><br><b>Nothing in this flow is alphabetical.</b> Every list is ordered by how often an Indian
  trainer actually picks it, because the first three entries are the only ones most people read.
  Strength and weight loss lead here; <b>Tamil</b> leads the languages; <b>K11</b> leads the
  certifications, and the note under them says <i>we do not check these</i> in those words, because
  four of eight platforms in the teardown collect certifications and none of them verifies any of
  it.
  <br><br><b>Experience is a band, not a number.</b> There is no dominant value so a stepper is
  wrong; nothing changes visibly as you drag so a slider is wrong; and a free field invites 0.5 and
  50 and needs validation for a value you would bucket anyway. Stored as one of
  {len(EXPERIENCE)} bands it also stays true next year without anybody editing it.'''),
 frame("5c", "Step 6 &middot; the week the diary reads", "new to the web", "/setup/hours", F5C,
  f'''<b>This is the step that justifies doing setup on a laptop.</b> The phone asks for days and a
  window and shows a summary line back. A 1440px canvas can show the <b>week itself</b>, at the same
  one-pixel-per-minute the schedule file draws, so the answer is visible as a shape before it is
  committed &mdash; {dur(HOURS_MIN)} a day, <b>{HOURS_WEEK // 60} hours</b> a week, and the two
  windows drawn with the hole between them.
  <br><br><b>One window set, applied to every day picked &mdash; and the band says so.</b> It is one
  track standing for every chosen day, not seven tracks, because seven would promise a per-day model
  this screen does not have. Per-day differences are real but rare on day one, and the full editor
  is one click away in the <a href="webapp-schedule.html#f-8a">schedule</a>, where the same table is
  drawn as a week and every gap in it is priced.
  <br><br><b>Two windows, not one range.</b> A single 06:00&ndash;20:30 would claim the trainer is
  free for lunch, and every capacity figure downstream would inherit the lie.
  <br><br><b>And the band is bounded by the canvas, not by taste.</b> The content box here is
  1440 &minus; 332 &minus; 104 = <b>{STP_BOX}px</b>, and at one minute per pixel that caps the range
  at {STP_BOX} minutes. The first version offered 05:00&ndash;22:00, which is {1320 - 300}, and the
  ruler&rsquo;s last label was scrolled out of sight &mdash; <code>21:00</code> rendered as
  <code>21</code>. It is {hm(LO)}&ndash;{hm(HI)} now, and the assertion is on the arithmetic rather
  than on the string.'''),
 frame("5d", "Step 7 &middot; the price before the pipe", "new to the web", "/setup/packs", F5D,
  f'''<b>How you work is asked first, because it decides which price lists exist.</b> An independent
  trainer sells their own packs; a gym-employed one sells what the gym&rsquo;s counter sets; plenty
  do both &mdash; freelance in the morning, the gym&rsquo;s floor in the evening &mdash; and keep two
  lists. The answer is a <b>defaults hint, never a gate</b>: who collects, and the gym&rsquo;s share,
  are still decided per client at add-client time, because the mix changes month to month. That
  sentence is the one the old page&rsquo;s step 3 contradicted.
  <br><br><b>Per session is computed, never typed.</b> It is the number a client asks about and the
  number a trainer gets wrong in their head, and a price list defined here is what lets the money
  screen group by something and lets selling a pack become picking one.
  <br><br><b>Skippable, and one exception that is not.</b> A gym-employed trainer with no gym
  package has a dead end waiting at add-client time, so <b>Continue</b> holds until at least one list
  is named &mdash; while <b>Skip</b> still passes on the whole step, which is a different and honest
  answer. Packs are written to the synced table as they are added, not into the draft, so a trainer
  who quits halfway still has their prices.'''),
 frame("5e", "Step 8 &middot; where it stops being a form", "setup &middot; 5b", "/setup/payment",
  F5E,
  f'''<b>On a valid format this screen stops being a form and becomes a read-back.</b> The ID at
  21px, the limit of the check stated outright, and the only proof actually available to us offered
  rather than implied. We check that a UPI ID <i>looks like</i> a UPI ID; we are not calling a
  payment provider, so we cannot confirm the account exists or that it belongs to this trainer, and
  <b>one wrong letter passes the check and sends the money to a stranger</b>. That is a real risk to
  somebody&rsquo;s income, and the honest response to it is a read-back and a &#8377;1 self-transfer,
  not a green tick.
  <br><br><b>The day a provider is wired in, the read-back is replaced by a name lookup</b> &mdash;
  not softened into the word &ldquo;verified&rdquo;. The app&rsquo;s docstring says that, and it is
  worth repeating because &ldquo;verified&rdquo; is exactly what this screen would become by
  accident.
  <br><br><b>And the bad-format message names the character and the handles.</b> Not &ldquo;invalid
  format&rdquo;, which sends somebody back to the same typo: <i>a UPI ID has an @ in it &mdash;
  yours probably ends {UPI_HANDLES[0]} or {UPI_HANDLES[1]}</i>, using the handles a trainer in India
  is likeliest to hold.'''))}'''


S11 = f'''<p class="note">The end of the flow is the one place a product is tempted to celebrate,
and the app refuses.</p>

{units(frame("6a", "After setup", "setup &middot; 6a", "/setup/done", F6A,
  f'''<b>No confetti.</b> Finishing a form is not an achievement &mdash; the celebration belongs to
  the first booking and the first payment, where the trainer has actually earned something, and
  spending it here devalues both. The app&rsquo;s <code>DoneScreen</code> says exactly that in its
  first four words.
  <br><br><b>The meter opens at {METER_PCT}%, not at zero.</b> Anybody reaching this screen has
  finished the flow, so the name / experience / specialities block is already banked: the meter
  starts at the work done rather than at the work owed. Identical real effort, and the original
  endowed-progress study measured a visible head start roughly <b>doubling</b> completion &mdash;
  34% against 19%.
  <br><br><b>And the items are weighted by what they are worth, not counted.</b> A UPI ID is
  {METER[3][1] // METER[2][1]}&times; a certification, because it is the difference between getting
  paid through the app and not. The three core answers are <b>one row</b> rather than three, because
  three ticks for one sitting&rsquo;s work makes the meter feel like it is counting keystrokes. And
  the line under it is the sentence that stops the whole thing reading as data collection for its own
  sake: <i>{METER_WHY}</i>
  <br><br><b>What was skipped is not nagged for.</b> It is picked up here, once, and then by the
  same meter on the deck. Nothing in this product asks twice.'''))}'''

S12 = f'''<p class="note">This screen lives in Settings and belongs to this document, because it is
the other half of signing in &mdash; and because the mobile design opens its section on it with the
strongest sentence in either file: <b>&ldquo;This is the most dangerous interaction in the whole app
and it is invisible on a screen.&rdquo;</b></p>

<div class="why why--danger" style="max-width:none"><p class="why__k">The failure it exists to
prevent</p>
<p>A trainer logs a full session in a basement with no signal. That evening they sign in on a new
phone. If signing in on the new device revokes the old session, the old phone hits a <b>401</b>, a
naive logout handler wipes local storage &mdash; and <b>an entire session&rsquo;s sets are gone</b>,
silently, with no error the trainer ever sees. Nothing on any screen in this set would have shown
it, which is exactly why it needed writing down.</p></div>

{units(frame("7a", "Devices, and a sign-out that refuses", "drawer &middot; 9b 9c",
  "/settings/devices", F7A,
  f'''<b>Four rules, and all four are the opposite of the obvious implementation.</b>
  <i>Never wipe local data on a 401</i> &mdash; token revocation is a sync-permission event, not a
  data-lifecycle event, so the outbox is quarantined and shown, never deleted. <i>Allow concurrent
  sessions</i> &mdash; single-session logins are actively harmful here, because the phone on the
  floor and the browser at the desk are both real at the same time, every day; OWASP leaves this to
  the application and the old &ldquo;no duplicate sessions&rdquo; ASVS rule was Level 3 and was
  dropped. <i>Notify, don&rsquo;t interrupt</i> &mdash; a new sign-in completes normally and the
  other devices get told out of band; an interstitial is reserved for a new device <b>and</b> a new
  country. <i>Drain before you revoke</i> &mdash; the confirm counts what is still upstream and
  pushes it first.
  <br><br><b>And the confirm refuses rather than proceeds.</b> {UNSYNCED} things on that phone have
  not reached the server; if the push fails, the sign-out does not happen. Sign-out is the one moment
  a trainer can genuinely lose a session&rsquo;s work, and a dialog that says
  &ldquo;{UNSYNCED} workouts still to upload from that phone&rdquo; is the difference between an
  informed decision and a silent discard.
  <br><br><b>The web makes this worse, not better, and that is the argument for the screen.</b> The
  browser is a <b>third</b> device and the one most likely to be shared &mdash; a gym&rsquo;s
  front-desk PC is exactly the machine somebody signs into once and never signs out of. The list
  names the device, the city and the last activity, because those three are enough to recognise
  yourself or not; the six-day-idle row carries a warning because six days idle on a shared machine
  is the case worth flagging.
  <br><br><b>What is not here:</b> a force-update wall. The phone needs one &mdash; a server floor
  plus a screen, with a support route on it, because a wall with exactly one button and no escape is
  what gets an iOS build rejected under Guideline 2.1. A browser reloads to the current build by
  definition, so the whole section deletes on the web. Its true web analogue is a <b>stale tab</b>
  left open across a deploy, and that is &sect;16&rsquo;s.'''))}'''


S13 = f'''<p class="note">Eleven principles, each with the change it caused. Three of them are named
patterns from one 2022 article and all three describe something a sign-in screen does by default, so
they are worth taking one at a time.</p>

<table class="rt" style="width:100%;margin-top:18px">
<thead><tr><th style="width:24%">Principle</th><th style="width:30%">What it says</th>
  <th>What it changed here</th></tr></thead>
<tbody>
<tr><th>Hostile pattern 3<br><span class="ink3" style="font-weight:400;font-size:12px">Kaplan, 2022</span></th>
  <td><b>Error-styled non-critical messages.</b> &ldquo;Reserve error-like visual treatments for
    critical system-status messages meant to disrupt workflow.&rdquo; Routine notifications in red
    make users feel &ldquo;assaulted or shamed&rdquo;.</td>
  <td><b>An expired code is amber.</b> It is the clock&rsquo;s doing, it spends no attempt, and the
    only thing to do about it is press one button &mdash; so red would be shaming somebody for
    taking eleven minutes to read a text. Two of the four refusals in &sect;05 are warnings and two
    are errors, and the tone is the difference between &ldquo;you did that&rdquo; and &ldquo;that
    happened&rdquo;.</td></tr>
<tr><th>Hostile pattern 1</th>
  <td><b>Premature error messages.</b> &ldquo;Wait until a user moves on from a field to display an
    error message related to an appropriate format.&rdquo;</td>
  <td>The behaviour spec&rsquo;s own rule, adopted verbatim: <b>validate on blur, clear on
    input</b>. And the stronger version on the phone field &mdash; the button is <i>disabled</i>
    until ten digits, so the commonest error cannot be committed rather than being caught.</td></tr>
<tr><th>Hostile pattern 2</th>
  <td><b>Aggressive required-field indicators.</b> Use a single indicator; add more only after a
    submission attempt.</td>
  <td>There is no asterisk anywhere in {N_STEPS} steps. One step is mandatory and its message names
    the <b>reason</b> &mdash; &ldquo;a client can&rsquo;t accept an invite from a blank name&rdquo;
    &mdash; while the other {len(OPTIONAL)} are marked <i>optional</i> in the rail before you reach
    them, which is the same information delivered as reassurance instead of as a threat.</td></tr>
<tr><th>10 guidelines for reporting errors in forms &middot; 1, 3<br>
    <span class="ink3" style="font-weight:400;font-size:12px">Krause, 2019 / 2024</span></th>
  <td>Validate inline, and keep the message next to the field it belongs to.</td>
  <td>The message slot sits between the field and the button, is <b>always present</b>, and keeps
    its height when empty &mdash; so a refusal never moves the button somebody is reaching
    for.</td></tr>
<tr><th>&hellip; &middot; 4</th>
  <td>&ldquo;Red is the colour most associated with errors, along with orange or yellow for
    warnings.&rdquo;</td>
  <td>Exactly the split the tokens already had, spent on the exactly right distinction. See the row
    above.</td></tr>
<tr><th>&hellip; &middot; 10</th>
  <td><b>Provide extra help for repeated errors.</b></td>
  <td><b>This is &sect;06 in one line.</b> The second resend is a repeated error, and what appears is
    not a louder message but two more <i>channels</i> &mdash; a call, and WhatsApp when it is wired.
    The guideline says review the design when the same error recurs; the design&rsquo;s answer is
    that SMS in India has a 2&ndash;8% tail and no amount of copy fixes a message that never
    arrives.</td></tr>
<tr><th>&hellip; &middot; 9</th><td>Never report an error in a tooltip.</td>
  <td>Nothing in this file hides a message behind a hover. The three limits &mdash; attempts, lock,
    daily ceiling &mdash; are in the message slot as sentences.</td></tr>
<tr><th>Progressive disclosure</th>
  <td>Disclose up front what is frequently needed; put the rest one gesture away.</td>
  <td><b>The pre-flight screen is the inverse and it is right.</b> Disclosure here is not about
    hiding complexity, it is about naming it: the most-cited onboarding complaint in the
    app&rsquo;s teardown was surprise, not length. So the flow spends one screen telling you what
    the {N_STEPS} questions are, and the rail keeps telling you for the rest of it.</td></tr>
<tr><th>Endowed progress</th>
  <td>A visible head start increases completion &mdash; 34% against 19% in the original study.</td>
  <td>The profile meter opens at <b>{METER_PCT}%</b>. Not a trick: the work really is done, and
    weighting the four items by business value rather than counting them is what stops the head
    start being a lie.</td></tr>
<tr><th>Heuristic 9 &middot; recognise, diagnose, recover</th>
  <td>Error messages should be expressed in plain language, state the problem, and suggest a
    solution.</td>
  <td>Three server failures, three different recoveries, and the classification is on the
    <code>code</code> field rather than the status &mdash; because both 429s mean opposite things
    and a naive handler turns a 30-second throttle into a ten-minute lockout screen.</td></tr>
<tr><th>Heuristic 2 &middot; match the real world</th>
  <td>Speak the users&rsquo; language; follow real-world conventions.</td>
  <td>Two answers in this flow come from the market rather than from a schema. Experience is a
    <b>band</b> because nobody thinks &ldquo;4.5 years&rdquo;. And <b>&ldquo;Not certified yet&rdquo;
    is a first-class option</b>, last on a list of {len(CERTS)} and not an absence &mdash; India has
    no licensing requirement for personal trainers, no statutory register and no protected title, so
    a flow that treats uncertified as a failure state is lying about the profession.</td></tr>
</tbody></table>

<div class="why why--warn" style="max-width:none"><p class="why__k">The one that cuts against
something here</p>
<p><b>Heuristic 5, error prevention, argues that the &#8377;1 self-transfer is not enough.</b> A UPI
ID that passes a format check and belongs to a stranger is an unrecoverable error with a real cost,
and the strongest form of prevention &mdash; a name lookup against the payment provider &mdash; is
not available because no provider is wired. So the screen does the next best thing and says so out
loud. That is honest, and it is not the same as safe: until a lookup exists, this is the one field in
the whole product where a typo costs money, and it is &sect;16&rsquo;s first row.</p></div>'''


ROUTES = [
    ("/", "redirect", "Resolves server-side to <code>/today</code>, <code>/sign-in</code> or "
     "wherever the identity actually lands. There is no launch screen on the web &mdash; the URL "
     "is the launch."),
    ("/sign-in", "page", "The number. A refresh keeps it; nothing is sent until the button."),
    ("/sign-in/verify", "page", "The code. Its own URL, so a refresh mid-OTP does not throw the "
     "number away &mdash; which is the whole reason this is three routes and not one wizard."),
    ("/sign-in/role", "page", "Which book. Only reachable when the response carries both."),
    ("/sign-in/new", "page", "7a. Reached only after a verify, never before &mdash; the route "
     "cannot be typed into, because arriving here is a statement about a number."),
    ("/invite/:token", "page", "7c. The token is in the URL because the link arrives by WhatsApp; "
     "it opens no sync scope, so a leaked link leaks a trainer&rsquo;s name and nothing else."),
    ("/paused &middot; /removed &middot; /no-trainer", "page",
     "7b, 7d, 7e. Three routes rather than one <code>?state=</code>, because each is a different "
     "sentence and a shareable URL that says <i>paused</i> is a support ticket that answers "
     "itself."),
    ("/setup", "page", "The pre-flight. Also where <code>/setup/</code> with no step lands."),
    ("/setup/:step", "page", f"Eight of them &mdash; <code>name</code> to <code>payment</code>. "
     f"Back button = previous step. A rail row is a link, so a trainer can go back to step 1 "
     f"without losing step 6."),
    ("/setup/done", "page", "The meter. Deliberately a route, so it survives a refresh and can be "
     "linked to from a support conversation."),
    ("/settings/devices", "page", "The other half of signing in. In Settings because that is where "
     "a trainer looks for it; in this document because &sect;12."),
]

S14 = f'''<p class="note">The IA&rsquo;s rule decides every line of this: <b>a panel is a place and
gets a URL; a selection is a mood and does not.</b> Sign-in is three places, not one wizard, for one
concrete reason &mdash; a refresh in the middle of an OTP must not throw the number away.</p>

<table class="rt" style="width:100%;margin-top:18px">
<thead><tr><th style="width:26%">Route</th><th style="width:10%">Kind</th>
  <th>Behaviour, and why it is shaped this way</th></tr></thead>
<tbody>''' + "".join(
    f'<tr><th><code>{r}</code></th><td>{k}</td><td>{d}</td></tr>' for r, k, d in ROUTES
) + f'''</tbody></table>
<p class="note" style="margin-top:16px"><b>What has no route, on purpose.</b> There is no
<code>/forgot-password</code>, no <code>/reset</code> and no <code>/change-password</code>, because
there is no password &mdash; and every competitor in &sect;02 ships all three plus the support load
that comes with them. There is no <code>/logout</code> either: signing out is a <b>consequential
action with a confirm</b>, and &sect;12 is why. And there is no force-update wall, because a browser
reloads to the current build by definition.</p>'''


PROP = [
 ("notes/design system/screens/xreploginotp.html",
  "The behaviour spec's wrong-code row is wrong", "danger",
  f"&sect;06 says <b>{SPEC_ATTEMPTS} attempts, then a {SPEC_LOCK_MIN}-minute lock</b>. The server "
  f"says <b>{MAX_ATTEMPTS}</b> and <b>{LOCK_MIN}</b> and the app follows the server. This is the "
  f"copy every other file in the set has been reading, so a screen quoting it promises two more "
  f"attempts than a trainer has. Fix the document, then this build fails its own assertion and "
  f"gets updated with it."),
 ("notes/design system/screens/xreploginotp.html",
  "&ldquo;WhatsApp is the reliable second path&rdquo;", "warn",
  "It is the <b>faster</b> path and a <b>narrower</b> one: under two seconds to an active user, but "
  "only 70&ndash;85% of a base has the app installed and opted in, against 92&ndash;98% for "
  "transactional SMS. Faster and narrower is a good second path and a bad first one &mdash; which "
  "is what that section already does, so only the reasoning moves."),
 ("notes/design system/screens/xreptrainersetup.html",
  "It says six steps; the app ships eight", "danger",
  "<b>Hours</b> and <b>packs</b> were added to <code>SETUP_STEPS</code> after that document was "
  "drawn, and its opening line still reads &ldquo;Six steps, fifteen states&rdquo;. The step chips "
  "along the top need two more, and &sect;05 &middot; <i>Getting paid</i> is no longer step 6."),
 ("webapp-information-architecture.html", "Three rows about this file are now false", "danger",
  f"<code>/setup/:step</code> is described as &ldquo;Six steps, each addressable, all six visible "
  f"in a left rail&rdquo; &mdash; eight. The file table says <b>Getting in &middot; 4 frames</b> "
  f"&mdash; {N_FRAMES}. And the AUTH &amp; ONBOARDING use-case table has six rows and needs "
  f"{N_IDENTITY} more for the identity states plus one for devices, none of which is a phone "
  f"screen the web reshaped &mdash; they are all <b>SAME</b>."),
 ("webapp-settings.html", "Devices is a Settings route and Settings does not draw it", "danger",
  "<code>/settings/devices</code> is where a trainer will look for it. Frame <b>7a</b> is drawn "
  "here because it is the other half of signing in, but the Settings file owns the route and needs "
  "the row &mdash; along with the sign-out confirm, which is the only destructive action in that "
  "file that can lose data."),
 ("webapp-components.html", "Five new entries", "warn",
  "<code>.otp</code> (one input, six slots &mdash; and the note about why it is not six inputs), "
  "<code>.msg</code> (the always-present four-tone slot), <code>.trust</code>, <code>.stp</code> "
  "(the step page), and two additions to <code>.wiz</code>: <code>__a</code> for the answer a "
  "completed row carries and <code>__opt</code> for the optional marker."),
 ("webapp-heuristics.html", "The auth screens have never been audited", "danger",
  f"Nine findings in &sect;01, and the three NN/g hostile patterns in &sect;13 are all about "
  f"screens no pass has looked at. The expired-code tone alone is a heuristic-9 row, and finding "
  f"09 &mdash; every second path unbuilt &mdash; is the second blocking item in the set."),
 ("webapp-client-portal.html", "7c is the client's first screen and the portal does not have it",
  "warn",
  "The consent step is the moment a client becomes a client. The portal file is the least dense in "
  "the set by design, and this belongs at the front of it &mdash; or the two files agree on which "
  "one owns it."),
 ("app/src/api/auth.ts", "The web needs the same flag, or it ships a live button", "warn",
  "<code>WHATSAPP_OTP_ENABLED</code> gates the phone. A web build without the equivalent will draw "
  "a working-looking WhatsApp control on the one screen where a trainer is already stuck. The "
  "comment on the constant says &ldquo;flip this the day <code>/v1/auth/otp/request</code> honours "
  "<code>channel: 'whatsapp'</code>&rdquo; &mdash; both halves flip together."),
 ("app/src + backend", "Voice OTP is designed and does not exist", "danger",
  "<code>OtpChannel</code> is <code>'sms' | 'whatsapp'</code>. The mobile design&rsquo;s 8b draws "
  "<i>Call me with the code</i> and calls it &ldquo;the one most apps skip&rdquo; that "
  "&ldquo;recovers a real slice of otherwise-lost signups&rdquo;. Nothing implements it on either "
  "half. It is the highest-value unbuilt thing in this file."),
 ("the design system", "There is no password, and that should be written down", "warn",
  "The absence is a decision, not an omission, and it is the single largest difference from every "
  "competitor in &sect;02. It belongs in the design system as a rule &mdash; <i>the number is the "
  "account; there is no credential to store, reset or forget</i> &mdash; so nobody later adds a "
  "&ldquo;set a password&rdquo; step to make the web feel more like a web app."),
 ("webapp-auth.html", "It is generated now", "warn",
  "<code>gen_auth.py</code> writes it. The policy numbers come from "
  "<code>application.yml</code>, the eight steps and their labels from <code>setup/draft.ts</code>, "
  "the answer sets from <code>setup/options.ts</code>, the meter weights from "
  "<code>setup/meter.ts</code>, and the working-hours window from <code>gen_schedule</code> "
  "&mdash; so step 6 cannot disagree with the diary it writes."),
]

S15 = f'''<p class="note">Twelve things, and five of them are defects in documents this page had to
read to be written &mdash; which is what happens the first time a design file is checked against the
code instead of against the file before it.</p>

<table class="rt" style="width:100%;margin-top:18px">
<thead><tr><th style="width:24%">File</th><th style="width:24%">What</th>
  <th style="width:8%">Kind</th><th>Detail</th></tr></thead>
<tbody>''' + "".join(
    f'<tr><th><code>{f}</code></th><td class="strong">{w}</td>'
    f'<td><span class="tag tag--{k}">{"Defect" if k == "danger" else "Gap"}</span></td>'
    f'<td>{d}</td></tr>' for f, w, k, d in PROP) + '</tbody></table>'

OPEN = [
 ("A UPI typo costs money", "warn",
  "<b>De-blocked, not solved.</b> A name lookup still needs a provider nobody has wired, and no "
  "amount of design substitutes for one. What changed is that the field stopped being where the "
  "risk lives. Two decisions: the handles are <b>pickable</b> and the local part defaults to the "
  "trainer&rsquo;s own number &mdash; in India the common shape is "
  "<code>&lt;phone&gt;@&lt;psp&gt;</code>, and the phone is the one string this product has just "
  "verified by sending a code to it &mdash; and the read-back happens again at the "
  "<b>first collection</b>, with the amount beside it. A wrong ID caught before a &#8377;9,600 "
  "collect is an edit; caught after, it is somebody else&rsquo;s money. Setup is not where the "
  "money moves, so setup is not where this has to be safe. One prerequisite, named: "
  "<code>SignInSession</code> does not carry the verified number, so it has to reach the setup "
  "flow before that default can be filled in."),
 ("Every second path into the product", "warn",
  "<b>De-blocked by refusing to ship a dark one.</b> WhatsApp needs a BSP and voice needs a channel "
  "that does not exist; neither is a design decision, so the honest count of fallbacks that can "
  "exist this quarter is <b>one</b> &mdash; the human route. Its defect was not that it was missing "
  "but that it switched itself off: <code>SUPPORT_WHATSAPP_NUMBER</code> reads an env var "
  "defaulting to empty, and the lock screen rendered a <b>disabled button</b> when the var was "
  "absent. A fallback that silently disables itself is indistinguishable from a product that never "
  "had one, and worse, because it occupies the space the real recovery should be in. Changed in "
  "<code>OtpScreen</code>: the row is not drawn when it cannot work, and the sentence underneath "
  "carries what is always true &mdash; the lock is on the number and not the account, it lifts by "
  "itself, and another device is unaffected. Voice OTP stays on this list as work, not as a "
  "blocker."),
 ("The country picker", "warn",
  "The mobile design has one (7c) with a searchable sheet and 56px rows, because NRI clients and "
  "Gulf-based trainers are real. Every frame here is <code>+91</code> with a chevron that opens "
  "nothing. The server&rsquo;s regex is <code>^[6-9]\\d{9}$</code> &mdash; India only &mdash; so "
  "drawing a picker before the backend accepts anything else would be the same defect as the "
  "WhatsApp button."),
 ("A stale tab across a deploy", "warn",
  "The phone&rsquo;s force-update wall deletes on the web, but its cause does not: a browser left "
  "open for a week against an API that has moved on. The honest analogue is a banner that says the "
  "build is old and reloads on click &mdash; never a wall, because the tab may hold an unsaved "
  "draft. Not drawn."),
 ("Sign-in with something already queued", "warn",
  "A trainer signs in on a browser that has unsynced work from a previous session on the same "
  "machine &mdash; a shared front-desk PC where two trainers alternate. Whose outbox is it? The "
  "phone cannot produce this case and the web can. Not answered."),
 ("The invite link's lifetime", "warn",
  "<code>/invite/:token</code> arrives by WhatsApp and WhatsApp links live forever in a chat. The "
  "token opens no data, so the exposure is a trainer&rsquo;s name &mdash; but an expiry and a "
  "used-once rule are still owed, and neither is specified on either half."),
 ("Two drafts, one flow", "warn",
  f"Setup answers live in <code>expo-secure-store</code> on the phone and would live in the browser "
  f"here. A trainer who starts on one and finishes on the other has two partial drafts and the "
  f"server sees only the finished one. Frame <b>4b</b> states the rule it assumes &mdash; whichever "
  f"finishes first wins &mdash; and nothing enforces it."),
]

S16 = f'''<p class="note">{len(OPEN)} things, and <b>none of them blocks</b> any more. The two
that did were about money and about getting in at all &mdash; the correct pair for this file to
have been blocked on &mdash; and neither was waiting on a decision this document could make. What
closed them was narrowing the claim: one moved the risk to where the money actually moves, the
other stopped shipping a fallback that turned itself off. Both are still work; neither now stops a
component being called Stable.</p>
<table class="rt" style="width:100%;margin-top:18px">
<thead><tr><th style="width:26%">Open</th><th style="width:9%">Kind</th>
  <th>Why it is still open</th></tr></thead>
<tbody>''' + "".join(
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
       '<a href="webapp-auth.html" aria-current="page">AUTH</a>'
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
    ("01", "The audit &mdash; nine things, and the onboarding half documented a flow that does "
           "not exist", S01),
    ("02", "Competitor analysis &mdash; four products, four passwords", S02),
    ("03", "The numbers, and the two rows the design document gets wrong", S03),
    ("04", "The number", S04),
    ("05", "The code &mdash; one input, and four ways to be refused", S05),
    ("06", "When the SMS does not arrive", S06),
    ("07", "Which book", S07),
    ("08", f"The {N_IDENTITY} ways a number can fail to be a trainer", S08),
    ("09", f"Onboarding &mdash; {N_STEPS} steps, {len(TYPED)} typed fields", S09),
    ("10", "The steps a desk asks differently", S10),
    ("11", "After setup", S11),
    ("12", "Devices &mdash; the most dangerous interaction in the product", S12),
    ("13", "Nielsen Norman, and the three hostile patterns a sign-in screen ships by default", S13),
    ("14", "The routes", S14),
    ("15", "What this changes in the other files", S15),
    ("16", "Still open", S16),
]

BODY_HTML = '\n\n'.join(
    f'<h2 class="sec"><span class="n">{n}</span>{t}</h2>\n{s}' for n, t, s in SECS)
for _f in FRAMES:
    assert BODY_HTML.count(f'id="f-{_f}"') == 1, _f
_pos = [BODY_HTML.index(f'id="f-{f}"') for f in FRAMES]
assert _pos == sorted(_pos), "frame ids out of document order"
N_PAT = S02.count('class="grp"') - 1
assert N_PAT == 4, N_PAT
N_FIND = len(FIND)

HTML = f'''<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>X REP &middot; Web app &mdash; Getting in</title>
<meta name="description" content="Phone, code, identity and the eight questions after it: the sign-in and trainer-onboarding screens, drawn against the app that ships them. X REP web application.">
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

<h1>Getting in &mdash; and the eight questions after it</h1>
<p class="doc__lede">The page this replaces drew <b>{STALE_FRAMES}</b> frames and documented a
six-step setup wizard. <code>app/src/setup/draft.ts</code> ships <code>SETUP_STEPS</code> and it is
<b>{N_STEPS}</b> &mdash; name, experience, specialities, certifications, languages, hours, packs,
payment &mdash; and <b>not one of the six was one of the eight</b>. Not renamed: absent. The
onboarding half of that file documented a flow somebody imagined, in the file whose only job is to
document onboarding.
<br><br>The sign-in half was closer and got the two things a sign-in screen must get right wrong. It
promised the code would arrive <b>on WhatsApp</b>, which <code>WHATSAPP_OTP_ENABLED&nbsp;=&nbsp;false</code>
refuses to send &mdash; the API function throws rather than falling back, precisely so a trainer is
never told to check WhatsApp for a text. And it drew <b>six separate inputs</b> for the code, which
is the one thing the mobile behaviour spec forbids by name: <i>&ldquo;one real input under six slots
&mdash; never six inputs&rdquo;</i>. The justification given was backwards &mdash;
<code>autocomplete="one-time-code"</code> targets one field, and six inputs are what break it.
<br><br>So this is a rebuild: <b>{N_FRAMES} frames</b> covering the phone, the code and its
{len(FAILURES)} refusals, the second paths, which book, all <b>{N_IDENTITY}</b> identity states, the
{N_STEPS}-step flow, and the device list &mdash; which appears in no file in this set and which the
mobile design calls <i>the most dangerous interaction in the whole app</i>. Every policy number is
imported from <code>application.yml</code> and asserted, including an assertion that the mobile
spec&rsquo;s wrong-code row <b>disagrees</b> with it.</p>
<div class="doc__meta"><span><b>Frames</b> <span data-frame-count>{N_FRAMES}</span></span>
  <span><b>Defects found</b> {N_FIND}</span>
  <span><b>Products examined</b> {N_PAT}</span>
  <span><b>Setup steps</b> {N_STEPS}, {len(OPTIONAL)} optional</span>
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
  X REP &middot; web application &middot; v1.1 &middot; every frame drawn at 1440&times;900 and
  scaled to fit. Colour, spacing and radius tokens are copied verbatim from
  <code>xrepdesignsystem.html</code> &mdash; if a value differs there, it is a bug here. Press
  <kbd>+</kbd> / <kbd>&minus;</kbd> to change the zoom.
  <br><br>Generated by <code>gen_auth.py</code>; edit that and re-run it rather than editing this
  file. The policy numbers come from <code>backend/src/main/resources/application.yml</code>
  (<code>app.otp</code> and <code>app.jwt</code>); the eight steps and their labels from
  <code>app/src/setup/draft.ts</code>; the answer sets &mdash; experience bands, specialities and
  their cap, certifications, languages, work modes, UPI handles &mdash; from
  <code>app/src/setup/options.ts</code>; the completion weights from
  <code>app/src/setup/meter.ts</code>; and the working-hours window in step 6 from
  <code>gen_schedule.py</code>, so that step cannot disagree with the diary it writes. Nothing in
  the prose is hand-typed.
  <br><br>Claims about the app trace to <code>app/src/api/auth.ts</code> (the nine-member
  <code>Role</code> union, <code>needsSetup</code>, <code>claimTrainerAccount</code>, the
  accept / decline / acknowledge trio, <code>readOtpFailure</code> and its four codes,
  <code>readSendThrottle</code>, <code>throttleMessage</code>, <code>WHATSAPP_OTP_ENABLED</code> and
  the two-value <code>OtpChannel</code>), to the eight screens in
  <code>app/src/screens/auth/</code>, to the ten in <code>app/src/screens/setup/</code>, and to
  <code>app/src/setup/draft.ts</code> / <code>options.ts</code> / <code>meter.ts</code>. The two
  mobile design documents quoted throughout are
  <code>notes/design system/screens/xreploginotp.html</code> (&sect;06 behaviour spec, &sect;07
  identity, &sect;08 delivery, &sect;09 devices, &sect;10 force update) and
  <code>xreptrainersetup.html</code>. Where those documents disagree with the server, &sect;03 and
  &sect;15 say so and the server wins.
  <br><br>Competitor rows trace to primary sources: ABC Trainerize&rsquo;s help centre on account
  creation, the in-app Setup Guide, its three onboarding journeys and the Timmy&nbsp;Explorer test
  client &mdash; that centre returns 403 to a direct fetch, so those rows are read from search
  summaries of it and are marked accordingly; TrueCoach&rsquo;s sign-up and client-invitation
  material; Everfit&rsquo;s help centre for the coach onboarding checklist and
  <i>Invite&nbsp;Myself</i>; and My PT Hub&rsquo;s published sign-up. India SMS figures &mdash;
  92&ndash;98% transactional delivery, WhatsApp reaching 70&ndash;85% of a base, DLT template
  scrubbing and the transactional-versus-promotional route as the commonest cause of failure &mdash;
  come from 2026 vendor and integrator material, which is the only published source that exists and
  is treated as a planning assumption rather than as a measurement.
  <br><br>&sect;13 quotes Nielsen Norman Group directly: Kate Kaplan, <i>Hostile Patterns in Error
  Messages</i> (2022) for the three named patterns; Rachel Krause, <i>10 Design Guidelines for
  Reporting Errors in Forms</i> (2019, reviewed 2024) for guidelines 1, 3, 4, 9 and 10; the
  <i>Error-Message Guidelines</i> article for heuristic 9; the <i>Progressive Disclosure</i>
  article; and Nielsen&rsquo;s heuristics 2, 5 and 9. The endowed-progress figures are the original
  study&rsquo;s, quoted by <code>meter.ts</code>.
</p>

</div>
<script src="assets/webapp.js"></script>
</body>
</html>
'''

if __name__ == "__main__":
    out = HERE / "webapp-auth.html"
    out.write_text(HTML)
    print("wrote", out, len(HTML), "chars")

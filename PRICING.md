# XRep — Pricing Strategy

**Status: a proposal, not a decision.** Nothing here is wired; billing does not
exist in the product. Companion to `WEB_LAUNCH.md`, which carries the running
cost this book is built on, and to `notes/XRep_growth_and_evolution_roadmap.md`,
which already settled several things pricing must not contradict.

**All figures are estimates.** Currency at **₹88 = $1**; infrastructure from
`WEB_LAUNCH.md` §6.4a; SMS and gateway rates from public list prices. Re-run the
arithmetic when any of them move — the *shape* of the model is what this book is
for, and the shape survives the numbers changing.

---

## 1. What is already decided

Pricing does not start from a blank page. Five things are settled elsewhere and
constrain everything below:

| Decision | Where | What it means for pricing |
| --- | --- | --- |
| **ARPU is low; you cannot buy growth.** CAC ≤ ₹2,000–3,000 | roadmap Part 2 | Price must make that CAC pay back fast. Sales is ground game, not ads |
| **The client app is free**, and is a distribution channel | roadmap Stage 1 | **Clients never pay.** The trainer is the only payer, ever |
| **Free onboarding + a free month** in the ground game | roadmap Stage 1 | A trial already exists as a decision |
| **Referral: a free month for both sides** | roadmap Stage 1 | Discounting is in months, not percentages |
| **Trainers subscribe on the website, not in the iOS app** | runbook §5D | Avoids Apple's ~30% cut. **The web-first launch makes this free** — billing lives where it was always supposed to |
| **₹500 / ₹1,000 per month** floated as the trainer subscription | runbook §5D | The existing hypothesis. §5 argues it is close, and slightly wrong in shape |

Also settled: Chennai + Coimbatore first, **target 50–100 active trainers in 90
days**, against a Chennai market of roughly 986 gyms.

**Decided in this book, 30 Aug 2026** — the model itself (§4) plus:

| Decision | Where |
| --- | --- |
| **₹499 per coaching seat, inclusive of GST** (nets ₹422.88), flat on clients | §4 · §8.1 |
| **One free non-coaching admin seat per team** | §4.2 |
| **No volume discount to ten seats; above ten, contact support** | §4.2 |
| **30-day free trial**, full Pro, no card to start | §4.4 |
| **Free tier at three clients** | §4.4 |
| **GST-registered; compliant invoices from the first paying customer** | §8.1 |
| **AI chat pricing deferred** — separate discussion, not a v1 question | §6 |
| **Gym pricing out of scope** — Ring 2 is not built | §11 |

---

## 2. What it costs to run

### 2.1 Fixed — and it barely moves

From `WEB_LAUNCH.md` §6.4a, DigitalOcean all-BLR1, at launch scale:

| | INR/mo (incl. 18% GST) |
| --- | --- |
| Launch — single instance, Redis deferred | **~₹3,640–4,150** |
| With Redis (needed at two instances) | ~₹5,190–5,710 |
| With staging | ~₹7,790–9,865 |

**Call it ₹4,000/month at launch and ₹10,000/month with staging and Redis.**

The important property: **this is nearly flat to trainer count.** Nothing in the
architecture scales per user until traffic actually forces a bigger container —
this schema's rows are small, there is no media, and the exercise library is
text. The first 100 trainers cost approximately the same as the first 10.

### 2.2 Variable — and it is remarkably small

| Item | Per trainer / month | Note |
| --- | --- | --- |
| **Trainer OTP** | ~₹0.90 | ~4.3 sign-ins at ₹0.20/SMS — a consequence of the 7-day token with **no refresh** |
| **Client OTP** (portal, v1) | ~₹4–6 | ~15 clients × ~2 sign-ins |
| **WhatsApp nudges** | **₹0** | A `wa.me` deep link sent from the trainer's own number. No BSP, no per-message fee |
| **Push (FCM)** | ₹0 | Free tier |
| **Storage / bandwidth** | ~₹0 | No media, no uploads |
| **Payment collection** | **₹0 – ₹10** | Entirely a question of rail: **UPI and RuPay debit are 0% MDR by regulation**, cards ~2% of the ₹499 charged = ₹9.98. GST on the fee is reclaimable (§8.1) |
| **Total** | **~₹5–17** | The spread is one decision — see below |

Four things worth pulling out of that table:

- **WhatsApp costing nothing is a genuine structural advantage.** Competitors
  running a BSP pay per message. The decision to make delivery a deep link the
  trainer sends themselves — taken for product reasons, in `CLAUDE.md` — turns
  out to remove the largest variable cost this category has.
- **`MUST-10` (refresh tokens) is a cost line, not only a UX one.** It cuts
  trainer OTPs roughly fourfold. Small money now; it also caps the abuse
  exposure `MUST-3`/M3 exists for.
- **The client portal multiplies SMS by roster size.** Still only ~₹6/trainer,
  but it is the one variable that grows with the product's success, and it
  arrives in v1.
- **Collection cost is a rail choice, and it is the cheapest line to get right.**
  A UPI Autopay mandate costs ~₹0; the same ₹499 on a card costs ₹9.98. At
  100 paying seats that is the difference between ₹0 and ₹1,000 a month —
  real, but a third of the infrastructure bill, and not worth negotiating
  over. §8 and `notes/XRep_deployment_runbook.md` §4b carry the gateway
  comparison; the recommendation is **Razorpay**, chosen on UPI-Autopay
  maturity rather than on rate.

**Future variable cost, not yet live:** AI business chat. `notes/
XRep_ai_features_spec.md` §1.6 already names it as "where the bill lives" and
says it needs real cost engineering at this ARPU. **Do not include AI chat in a
base tier** — see §6.

### 2.3 Gross margin

At ₹4,000 fixed and ~₹6–16 variable (the upper end only if everybody pays by
card), **gross margin is above 95% from about the tenth paying trainer.** This is not a business with a cost problem. It is a
business with a distribution problem, which is exactly what the roadmap says.

---

## 3. What a trainer can pay

The anchor that matters is not competitor pricing — it is **what a trainer
charges for one session.**

| | Typical |
| --- | --- |
| PT session, Indian metro gym | ₹500–1,500 |
| Independent trainer, per session | ₹400–1,000 |
| Monthly package per client | ₹3,000–8,000 |
| A working trainer's gross, 10–25 clients | ₹50,000–2,00,000/month |

**So: price the product at roughly one session per month.** A trainer who
recovers the subscription from a single session has no decision to make, and
"less than one session a month" is a sentence that closes a demo in a gym
corridor. It also means the price rises naturally with the trainer's own rates —
a ₹599 product is one session to a mid-market trainer and a rounding error to a
premium one.

Global tools (Trainerize, TrueCoach, My PT Hub) sit at $20–100/month —
₹1,800–9,000. They are not competitors on price in this market; they are the
reason a well-priced Indian product wins.

---

## 4. The model — flat on clients, per seat on trainers

**One paid plan, unlimited clients.**

**Flat on clients. Per seat on trainers.**

| Tier | Price | Clients | Trainers | For |
| --- | --- | --- | --- | --- |
| **Free** | ₹0 | up to **3** | 1 | The on-ramp and the referral landing spot |
| **Pro** | **₹499/mo** | **unlimited** | 1 | Every working trainer |
| **Team** | **₹499 per trainer/mo** | **unlimited** | 2+ | A studio, or a trainer who has hired |

Annual: **pay for 10 months, get 12** — ₹4,990 per seat.

**One number, both products: ₹499 per trainer, always.** Team coordination —
the shared roster view, the activity log, reassignment, the owner's revenue
roll-up — is included free the moment there are two seats. A five-trainer studio
pays **₹2,495/month**; a ten-trainer gym pays **₹4,990**.

Two earlier drafts of this book were wrong in opposite directions, and the
corrections are §4.1 and §4.4. The first proposed client-count tiers
(₹299/10, ₹599/30) — wrong because the client axis has no range. The second
proposed **Studio at ₹1,199 flat for unlimited trainers** — wrong for exactly
the opposite reason, and worse:

| Team size | Old "Studio ₹1,199" | Per seat at ₹499 | |
| --- | --- | --- | --- |
| 5 trainers | ₹1,199 (₹240/trainer) | **₹2,495** | 2.1× |
| 10 trainers | ₹1,199 (₹120/trainer) | **₹4,990** | 4.2× |

It priced a team **below** solo, per trainer. A studio would have been paying
half what an independent trainer pays for the same software, for more of it.

### 4.1 Why per-client tiering loses here

**In-person coaching has a physical ceiling, so the axis has no range.**
`backend/CLAUDE.md` already worked this out for the seed data: 44 clients is
"138 sessions and 137 hours a week against a 48-session shift". One trainer's
week holds roughly **48 sessions**, so at 2–3 sessions per client that is
**16–24 active clients, and no more.** Not a licensing limit — a limit of hours
in the day.

Tiering is a way to charge large customers more than small ones. **XRep has no
large customers and cannot have any.** Nearly every trainer lands between 6 and
20 clients, which means client-count bands add complexity, cliffs and gaming to
an axis that barely moves. It is machinery for a spread that does not exist.

**The cliff punishes exactly the behaviour the product depends on.** Your
eleventh-client case is the whole argument:

> A trainer on Starter with 10 clients signs an 11th. The bill doubles,
> ₹299 → ₹599, for one client.

What they actually do is not "upgrade":

- **Keep the 11th client out of XRep** — the worst outcome, and the likeliest.
  Their payments, sessions and dues live in a notebook again, the money book is
  now incomplete, and the data asset is corrupted.
- **Archive somebody** to stay under the cap, destroying a live record.
- **Churn**, because the moment of growth became a bill shock.

This is the same failure as pricing on collections (§4.3): **any charge that
scales with clients gives the trainer a reason not to enter a client.** The money
book only works if it is complete. A pricing model that makes the trainer
hesitate before adding a row is a pricing model attacking its own product.

**Flat pricing makes adding a client unambiguously free and always good.** That
is worth more than the tiering revenue — which, at this scale, does not even
exist:

| Model, 100 trainers (10 on Free) | MRR |
| --- | --- |
| Tiered — 60 Starter, 27 Pro, 3 Studio | ₹37,710 |
| **Flat ₹499 — 87 Pro, 3 Studio** | **₹46,910** |
| Flat ₹599 — 87 Pro, 3 Studio | ₹55,710 |

**Flat earns more.** Tiering only pays when many customers are large; here it
just discounts the majority who would have paid the single price.

**And flat is sellable in a gym corridor.** "₹499 a month, everything, as many
clients as you want" is one sentence. A tier table is a conversation, and the
ground game of roadmap Stage 1 is founder-led demos standing up.

### 4.2 Why trainers ARE the right axis, when clients are not

The two axes get opposite answers from the same test:

> **Does charging for this thing give somebody a reason not to record something
> the product depends on?**

**Clients: yes.** A per-client charge makes an incomplete money book rational
(§4.1). The trainer keeps client eleven in a notebook and the data asset breaks.

**Trainers: no.** Declining to add a coach to the team corrupts nothing.
V26's law is *a team widens reads; it never moves ownership* — every trainer
already owns their own clients, programs and money book in their own workspace.
A coach left off the team simply is not visible to the owner. **What the owner
forgoes by not paying is exactly the visibility they were buying**, which is what
a well-aligned charge looks like.

Three more reasons the seat is the right unit:

- **It is the revenue unit of the customer's own business.** A studio adds a
  fifth trainer because that trainer earns. At perhaps ₹80,000 gross per trainer
  per month, ₹499 is **0.6%** — the same fraction a solo trainer pays, which is
  the fairness argument in one line.
- **Unlike clients, the axis has real range.** One to fifty and beyond, with no
  48-session ceiling. §4.1 rejected tiering because the client axis had no
  spread; the trainer axis has nothing but spread.
- **The schema already carries it.** `team_member` (V26) with roles
  `owner` · `admin` · `coach`, and **`team.seat_limit` already exists** in
  `TeamService` with `defaultSeatLimit = 5`. The meter is built; it has simply
  never been connected to money.

**Linear, never banded.** No "up to 5 / up to 15" plans — that would import the
eleventh-client cliff onto the axis where per-unit pricing is cleanly available.
The sixth trainer costs ₹499, the same as the second.

**A seat is an active `team_member` who coaches.** Suspend or remove one and the
next invoice is smaller; no notice period, no annual seat lock at monthly billing.

**One free non-coaching admin seat per team.** *Decided 30 Aug 2026.* An owner or
admin who runs the business but coaches nobody does not occupy a paid seat —
charging ₹499 for a dashboard reads badly and would be the first objection in
every studio conversation. The test is coaching, not role: **a `team_member` with
no clients of their own is free; the moment they own a client they are a seat.**
That is checkable against data the schema already has, needs no honour system,
and converts automatically the day an owner picks up their first client.

Exactly one such seat is free per team. A second non-coaching administrator is a
paid seat — at that size the team is buying management, which is the product.

**The owner pays for every seat**, and this creates a growth loop worth naming:
when a trainer leaves a studio they keep their own workspace, their clients and
their books, and they start paying their own ₹499 — or drop to Free and convert
later. **A team is a customer-acquisition channel for solo seats.**

**No volume discount up to ten seats.** *Decided 30 Aug 2026.* One price, every
seat, one to ten — which keeps the arbitrage closed (five solo trainers and one
five-seat studio both pay ₹2,495) and keeps the sentence short.

**Eleven or more seats: contact support.** *Decided 30 Aug 2026.* Self-serve
stops at ten. Above that it is a conversation, which is correct on both sides —
a customer that size wants to negotiate and to talk to a person, and you want to
know who they are before they are 15% of revenue. It also means **no volume
discount has to be designed today**; the first large team sets the precedent, and
setting it in a negotiation beats guessing at it in this document.

### 4.3 Why NOT a percentage of collections

Tempting, because the money book already knows exactly what a trainer collects.
**Reject it, and not on squeamishness:**

- **It corrupts the core data asset**, in precisely the way §4.1 describes. The
  money book only works if the trainer records *every* payment. Take a cut and
  you have handed them a reason to record cash off-book — and the money book is
  the retention hook (§9), the churn signal, and the input to every planned AI
  feature.
- It reads as a partnership the trainer did not ask for. Trainers here already
  share revenue with a gym; a second slice, taken by their own software, is the
  wrong feeling.
- It edges toward a payments business and its regulatory questions. You are not
  in the flow of funds — UPI is a deep link to the trainer's own ID — and staying
  out is a deliberate simplicity worth keeping.

### 4.4 On the free tier, and the one cliff that remains

**The free trial is 30 days.** *Decided 30 Aug 2026.* Full Pro, every feature,
no card required to start — the roadmap's "free onboarding + a free month",
pinned to a number. It runs alongside the free tier rather than instead of it:
the trial is what a founder demo hands over in a gym corridor, and the free tier
is where somebody lands who is not ready to decide.

A permanent free tier at three clients is different, and worth having as well: it costs about
**₹2/month** to serve, removes the card from the first conversation (which
matters more here than in the US), and gives the referral loop somewhere to land
that is not a countdown.

**Free → Pro at the fourth client is the only cliff in the model, and it is the
correct one.** It is the moment a hobby becomes a business. Four clients at
₹4,000 is ₹16,000 a month gross, against ₹499 — about 3%. Nobody agonises over
that, and unlike the eleventh-client cliff it does not recur.

**The risk to watch:** trainers parking on Free by archiving clients to stay
under three. If the data shows it, the cap becomes *3 active + 10 lifetime*
rather than a price change.

---

## 5. How foreign software does it, and why we should not copy it

Almost every established PT platform tiers by active clients. The pattern is
real, and so is the reason it does not transfer.

| Product | Shape | Rough range |
| --- | --- | --- |
| **Trainerize** | Many narrow client bands, very cheap at 1–2 clients | ~$5 → $100+/mo |
| **TrueCoach** | Client bands — 5 / 20 / 50 | ~$20 → $90+/mo |
| **PT Distinction** | Client bands | similar |
| **Everfit** | Small free tier, then client-based | similar |
| **My PT Hub** | **Flat, unlimited clients** — the outlier, and the differentiator | ~$45–60/mo |

*Prices approximate and from memory — verify before quoting them to anyone.*

**Two things to take from this list, and one to leave.**

**Take: the bands are narrow.** Where tiering is used, the steps are small and
numerous, precisely to avoid the eleventh-client cliff. The ₹299→₹599 doubling I
first proposed is a far worse version of what these products actually do. If
tiering were right here, it would need six bands, not two.

**Take: My PT Hub sells "unlimited" as a feature.** It is the differentiator in
their positioning, not a concession. That is the strategy §4 recommends, and in a
price-sensitive market it is stronger still.

**Leave: their market is not ours.** These tools serve **online** coaches, where
one person can carry 50, 100 or 300 clients because there is no room to stand in.
The client axis has enormous range, so tiering captures real value. XRep serves
**in-person** trainers with a 48-session week. Copying a pricing model designed
for a 300-client ceiling into a 24-client market imports all of the complexity
and none of the upside.

There is a second difference worth naming: those products are **priced in USD for
Western coaches**. At ₹1,800–9,000/month they are not competing with us on price
— they are the reason a well-priced Indian product wins the market outright.

### So what does the trainer with 11 clients do?

**Nothing.** They add the eleventh client, the bill does not change, and they
never think about it. That is the entire point, and it is the answer your
question was looking for.

---

## 6. What goes in which tier

Feature gating should follow **who the feature is for**, never how much it costs
to run:

| | Free (3 clients) | Pro ₹499 | Team ₹499/seat |
| --- | --- | --- | --- |
| Roster, programs, diary, logging | ✅ | ✅ | ✅ |
| Money book, UPI links, dues | ✅ | ✅ | ✅ |
| Client portal | ✅ | ✅ | ✅ |
| Nudges | ✅ | ✅ | ✅ |
| **Unlimited clients** | — | ✅ | ✅ |
| Progress reports | — | ✅ | ✅ |
| Trainer profile page | — | ✅ | ✅ |
| Multi-workspace (V37) | — | ✅ | ✅ |
| Team coaching (V26) | — | n/a | ✅ |
| Revenue roll-up (owner) | — | n/a | ✅ |

**Team is not a feature tier — it is the same product, metered.** Every seat gets
exactly what a Pro trainer gets; what the *team* adds is coordination across
seats, and that comes free with the second seat. There is nothing to upsell and
nothing to explain: one price per trainer, whoever they work for.

**Never gate the money book.** It is the wedge, the retention hook and the data
asset. A trainer who cannot see what they are owed has no reason to open the app.

**AI business chat: pricing deliberately not decided.** *Deferred 30 Aug 2026 —
to be discussed separately.* It does not ship in v1, so nothing here is blocked
by it. Two constraints to carry into that discussion, and no more:

- Per `notes/XRep_ai_features_spec.md` §1.6 it is **the only feature with a real
  marginal cost** — "this is where the bill lives".
- It is therefore **the one place a per-use ceiling is right**, because unlike a
  client it costs money every time. The `AI` rate-limit tier already exists for
  exactly this.

**Do not fold uncapped AI into the flat plan** by default while the question is
open — that is the one move that would be hard to reverse.

---

## 7. Unit economics

All figures **net of GST** — ₹499 inclusive nets ₹422.88 (§8.1) — and against
infrastructure that is now ~15% cheaper because the input credit is reclaimable.

| | |
| --- | --- |
| Trainer pays | ₹499 |
| **Net revenue** | **₹422.88** |
| Variable cost | ~₹6–16 |
| Contribution | **₹407 – ₹417** |
| CAC (roadmap ceiling) | ₹2,000–3,000 |
| **Payback** | **5–7 months** |
| LTV at 24-month life | ~₹9,800 – 10,000 |
| **LTV : CAC** | **3.3–5 : 1** |

The spread is the collection rail (§2.2): **₹407 if everybody pays by card,
₹417 if everybody is on UPI Autopay.** It moves nothing that matters —
break-even stays at nine seats either way.

These are the launch numbers and they work. For reference, a future ₹599 cohort
(₹507.63 net) would shorten payback to 4–6 months and lift the ratio to ~4–6:1 —
about 20% more contribution per seat, available later under §9 rule 6 without
repricing anybody already signed.

### Break-even

| Fixed cost (net of reclaimable GST) | Paying seats needed |
| --- | --- |
| ~₹3,520 (launch) | **9** |
| ~₹8,360 (staging + Redis) | 20 |

**Nine paying seats covers the infrastructure** — one studio and change. Against
a 90-day target of 50–100, hosting stops being a consideration almost
immediately, which is the real reason not to over-optimise `WEB_LAUNCH.md` §6.4a.

### What a team is worth

Per-seat changes the shape of the business as soon as one studio signs:

| Customer | Coaching seats | Billed/mo | Net/mo |
| --- | --- | --- | --- |
| Independent trainer | 1 | ₹499 | ₹423 |
| Small studio | 3 | ₹1,497 | ₹1,269 |
| Studio | 5 | ₹2,495 | ₹2,114 |
| Large studio (self-serve ceiling) | 10 | ₹4,990 | ₹4,229 |
| Above ten | — | contact support | — |

*Each also gets one free non-coaching admin seat (§4.2).*

**A ten-seat studio is ten trainers of ground game in one conversation.** CAC per
seat collapses on a team sale — one demo, one onboarding, one invoice — so
against the roadmap's ₹2,000–3,000 solo CAC, a five-seat studio closed in a
single visit pays back in weeks rather than months.

### At the 90-day target

100 trainers — 10 on Free, 75 solo Pro, and 3 studios averaging 5 seats:

```
Billed        90 seats × ₹499        = ₹44,910   gross MRR
less GST      90 × ₹76.12            =  ₹6,851
                                       ────────
Net MRR                                ₹38,059   ARR ~₹4.6 lakh
less infra (staging + Redis, net)       ₹8,360
less variable                             ~₹540
                                       ────────
Contribution                           ₹29,159/month   (~77%)
```

*(75 solo Pro + 3 studios averaging 5 coaching seats each, plus 3 free admin
seats that bill nothing. 10 trainers on the free tier.)*

This is not yet a salary. It is a validated wedge with 95%+ gross margin and a
distribution problem — the correct thing to have at 90 days. (The same roster on
a future ₹599 cohort would net ₹45,687, which is the shape of the first price
increase rather than a decision outstanding.)

Note how much rests on the team mix. Those same three studios under the old
₹1,199 flat price would have billed ₹3,597 instead of ₹7,485, and the error
would have grown with every team signed.

## 8. Collecting the money

- **Bill on the web, never in the iOS app** (runbook §5D). The web-first launch
  makes this natural rather than a workaround — **this is a real strategic
  benefit of the launch order** and worth noticing.
- **UPI Autopay, via Razorpay** — Cashfree as the alternate. UPI and RuPay debit
  carry **zero MDR by regulation**, so on that rail the cost is a platform or
  per-debit fee rather than a percentage; cards are ~2%, which is ₹9.98 on a
  ₹499 charge and reclaimable-GST on top. **Verify every rate in writing**, and
  get one specific answer: *what is charged on a UPI Autopay debit* — nothing,
  or a flat per-debit fee. Razorpay is picked on UPI-Autopay maturity and on
  having a Payment Links product that covers hand-invoicing with no code, not
  on price. `notes/XRep_deployment_runbook.md` §4b has the comparison, the
  integration shape and the full cost table; `WEB_LAUNCH.md` MUST-17 tracks it.
  This is one of the genuine advantages of billing Indian customers.
- **Autopay mandates matter more than the price.** Manual monthly renewal at
  ₹299 has terrible collection rates. A UPI mandate at signup is the single
  highest-leverage billing decision in this document.
- **Annual for cash and retention.** Ten months for twelve, offered at renewal
  rather than at signup — a new trainer will not commit a year, and a trainer at
  month three will.
- **GST: registered, and invoicing from the first paying customer.**
  *Decided 30 Aug 2026* — ahead of the ₹20 lakh threshold, deliberately. Two
  consequences, one good and one that costs money, and §8.1 works the second one
  through because it changes the price.
- **Dunning is a product surface.** A failed mandate must show inside the app
  with a one-tap fix, and the trainer must never lose access to their money book
  over a payment failure — read-only, never locked out. Losing a trainer's books
  to a card decline is how you lose the trainer.

---

### 8.1 What GST registration does to ₹499

**The good half: infrastructure gets ~15% cheaper.** Registered, the 18% OIDAR
GST on DigitalOcean and other tooling is reclaimable as input credit rather than
a sunk cost. `WEB_LAUNCH.md` §6.4a's launch figure drops from **~₹4,150 to
~₹3,520** effective, and the staging figure from ~₹9,865 to ~₹8,360.

**The half that costs money: ₹499 is no longer ₹499 to us.** A decision is
needed, and it is not cosmetic:

| | Trainer pays | GST | **Net to XRep** |
| --- | --- | --- | --- |
| **₹499 inclusive** | ₹499 | ₹76.12 | **₹422.88** |
| ₹499 + GST | ₹588.82 | ₹89.82 | ₹499.00 |
| **₹599 inclusive** | ₹599 | ₹91.37 | **₹507.63** |

**Decided 30 Aug 2026: ₹499 inclusive of GST. Net ₹422.88.** The reasoning:

- **Most trainers cannot reclaim it.** An independent trainer under the ₹20 lakh
  threshold is unregistered, so GST is a real cost to them, not a wash. Adding
  18% on top makes the product 18% more expensive to the buyer for no benefit to
  anyone.
- **One number survives a corridor demo.** "₹499 a month, all in" is the pitch.
  "₹499 plus GST, so ₹589" is a worse pitch and a worse price.
- **₹589 breaks the anchor.** §3's whole argument is *one session a month*. ₹499
  is one session; ₹589 is starting to be more than one.

**₹599 inclusive is not discarded — it is headroom.** It nets ₹507.63, and rule
6 in §9 raises prices on **new signups only**. So a later cohort can be brought
in at ₹599 without touching a single trainer already on board, once the ground
game has proved the product at ₹499. That is the price increase to hold in
reserve; it is not a launch decision, and it is now the *only* pricing lever left
unpulled.

**Everything in this book is computed at ₹499 inclusive → ₹422.88 net.**

**Invoices must be GST-compliant from the first paying customer**, which means a
GSTIN on the invoice, the correct place-of-supply, and HSN/SAC on the line item.
This is a billing-system requirement, not an afterthought — whatever collects the
money has to emit a compliant invoice on day one. Confirm the specifics with the
CA before wiring it.

---

## 9. Rules to hold

1. **Grandfather the first 100 trainers on their signing price, permanently.**
   They are the reference customers, the case studies and the referral engine.
   The revenue forgone is trivial; the goodwill is not.
2. **Never price on collections** (§4.3), and **never price per client** (§4.1).
   Both are the same mistake: a charge that scales with clients is a reason not
   to enter one, and an incomplete money book is a broken product.
3. **Never gate the money book** (§6).
4. **Clients never pay.** They are distribution (roadmap Stage 1).
4b. **Every coaching trainer is a paid seat.** The trainer is the revenue unit;
   a team is trainers, so a team is seats. Never sell "unlimited trainers" — it
   prices a studio below a solo trainer for the same software (§4.2).
5. **Data export exists and is free**, on every tier including Free. It looks
   like a retention risk and is the opposite: a trainer trusts their books to a
   product they can leave.
6. **Raise prices on new signups only**, never on an existing trainer mid-life.
7. **Discount in free months, never in percentages** — it matches the referral
   mechanic already decided, and a percentage discount never ends.

---

## 10. What to validate before committing

Pricing is the one thing in this repository that cannot be settled by reasoning.
The ground game of Stage 1 is also the price experiment; run it deliberately:

1. **Ask the design partners what they pay for now** — gym software, Excel,
   nothing. The alternative they are actually comparing against is the number
   that matters, not our cost.
2. **₹499 inclusive is decided — so test resistance, not the number.** Across
   the first 20–30 trainers, record where the price actually lands: how many
   hesitate, how many ask for a discount, how many convert from trial without
   negotiating. Little resistance is the signal that the ₹599 headroom in §8.1
   is real for the *next* cohort. Heavy resistance means the anchor in §3 is
   wrong for Chennai, which is a bigger finding than a price.
3. **Measure the actual roster distribution.** §4.1 rests on in-person coaching
   capping at 16–24 active clients. If a meaningful share of trainers turn out to
   run 40+ — online coaching on the side, say — the flat argument weakens and
   Studio may need a client dimension after all. **This is the assumption most
   worth checking**, because the whole model rests on it.
4. **Measure trial-to-paid**, and whether the free month or the free tier
   converts better. They are different mechanisms and only one may be needed.
5. **Confirm PT session rates in Chennai and Coimbatore specifically.** The
   "one session a month" anchor is the whole pricing argument, and it is built on
   a national range rather than a local one.

---

## 11. Open questions

Most of this book is now decided. What remains:

1. **AI business chat pricing** — deferred by decision, to be discussed
   separately (§6). Not a v1 question.
2. **Does the 16–24 client ceiling hold in Chennai?** The flat-on-clients
   argument (§4.1) rests on it. §10.3 is how you check.
3. **Build seat-metered billing at launch, or hand-invoice the first studios?**
   `team.seat_limit` already gives the count, and three invoices are cheaper than
   a billing system. GST compliance (§8.1) applies either way.
   **Now tracked as a blocker** (30 Aug 2026): `WEB_LAUNCH.md` MUST-16…18 and
   the runbook's §4b. The answer this book needs is only the rail; the **trial
   clock is a separate, smaller thing that has to exist before the first
   trainer signs up**, because a trial with no recorded start has no honest
   expiry afterwards.

**Settled 30 Aug 2026 and not to be reopened without a reason:** flat on clients ·
**₹499 per coaching seat, inclusive of GST** · one free non-coaching admin seat
per team · no volume discount to ten seats · above ten, contact support ·
30-day free trial · free tier at three clients · GST-registered with compliant
invoices from the first paying customer.

The price is now **fixed for launch**. The only lever left is the ₹599 headroom
in §8.1, and §9 rule 6 says it applies to new signups only.

**Out of scope:** gym pricing. Ring 2 is not built, so it is not designed here.
The only thing this book asks of it is that the trainer seat carries over
unchanged — a gym's coaches are coaches — and that whatever is decided for a
gym's *members* does not contradict §4.1's flat client rule.

# True Auto Zim — World-Class Business Plan

**Japan 🇯🇵 → Zimbabwe 🇿🇼 | Quality used cars, imported with total transparency.**

> Version 1.0 — prepared for the founding team. All duty/tax figures are
> **indicative** and must be verified with ZIMRA / a licensed clearing agent
> before quoting clients. Exchange rates and freight change — keep the
> `config.py` cost model updated.

---

## 1. Executive Summary

**True Auto Zim** is an online platform that imports quality used vehicles from
Japanese auctions and delivers them to customers in Zimbabwe. Our model is
simple and defensible:

1. **We show the customer the actual auction price** (the FOB price paid in Japan).
2. **We charge one fixed, clearly-stated commission per car** — no hidden mark-ups.
3. **We publish every other cost line-itemised** (freight, insurance, duty, VAT, clearing, transport).
4. **We let the customer track the car live** through a 10-stage journey — auction → shipping → port → customs → clearing → delivery — on the website, in the app, and on WhatsApp.

**Our moat is trust.** Most Zimbabwean buyers have been burned by agents who
hide mark-ups and disappear. Transparency isn't a feature for us — it's the
whole business model, and it's exactly what the market is crying out for.

---

## 2. The Opportunity

### 2.1 The Zimbabwe used-car market
- Zimbabwe relies heavily on imported second-hand vehicles, and **Japan is the dominant source** — Toyota Vitz, Honda Fit, Mazda Demio, Toyota Axio, Corolla Fielder, Nissan Note, Nissan X-Trail, Subaru Forester, Toyota Harrier and Land Cruiser Prado dominate the roads and the market.
- Buyers currently use platforms like **BeForward** (Japan auction listings) plus a **middleman agent** to handle shipping, duty and delivery.
- Pain points we exploit:
  - ❌ **Opaque pricing** — agents add unknown mark-ups on top of auction prices.
  - ❌ **No tracking** — customers wait months with no visibility.
  - ❌ **No accountability** — faceless "agents" that disappear after deposit.
  - ❌ **No local trust** — no one to visit, call or hold accountable in Harare.

### 2.2 Why we win
| BeForward-style middlemen | True Auto Zim |
|---|---|
| Hidden mark-up on every car | One fixed commission, published |
| No landed-cost visibility | Full itemised landed-cost breakdown |
| "Trust me, it's coming" | Live 10-stage tracking + evidence |
| No local presence | Local Zimbabwean company, local contacts |
| Pay by bank/wire only | EcoCash, InnBucks, OneMoney, bank transfer |
| No after-sales | Delivery, inspection & accountability in Zim |

### 2.3 Target customers
1. **Individuals** upgrading to a reliable Japan import (dominant segment).
2. **Families / SMEs** needing wagons, SUVs and workhorses.
3. **Diaspora buyers** (UK, SA, US, Australia) buying for relatives in Zim — they pay in USD and are often burned by bad agents; our transparency is *the* selling point.
4. **Bulk / fleet buyers** — taxis (Vitz/Fit), businesses, church/harvest transport.

---

## 3. Business Model — Fixed Commission

We earn **one fixed commission per car** (default `$850`, configurable in `config.py`).

### 3.1 Unit economics — worked example (Harrier)
Using the platform's own landed-cost engine:

| Line item | USD |
|---|---|
| Japan auction price (FOB) | $11,500 |
| Freight Japan → Beira/Durban | $1,400 |
| Insurance (3% of CIF) | $387 |
| Auction & export fees | $300 |
| Import duty (25% of CIF — indicative) | $3,225 |
| Surtax (10% — indicative) | $1,290 |
| VAT (15% on CIF+duty+surtax) | $2,612 |
| Port handling | $250 |
| Clearing & inspection | $400 |
| Transport to Harare | $700 |
| **True Auto commission (fixed)** | **$850** |
| **Total landed in Harare** | **$22,914** |

The customer sees **every line**, the receipts are shared, and we earn exactly
`$850` — nothing else. That is the pitch.

### 3.2 How cash flows
1. Customer picks a car (or requests one) → creates an order.
2. We bid with their approval → **auction won**.
3. Customer pays **deposit** (default 20% of FOB) via EcoCash/InnBucks/OneMoney/bank.
4. We pay freight, duty and clearing (funded from deposit + our float).
5. Customer pays **balance on delivery**, then takes the car.
6. Every payment is recorded and verified on the platform; the customer sees their paid vs outstanding total at all times.

### 3.3 Pricing guardrails
- Never quote without a **written, itemised landed-cost estimate** (the platform generates these automatically).
- Duty rates change: always re-verify with ZIMRA/clearing agent before locking a quote.
- Hold enough float or a small line of credit to cover freight/duty while deposits clear.

---

## 4. The Transparency System (the product)

This repo ships a working MVP of exactly this system:

- **Public catalog** with FOB **and** landed-in-Harare price on every card.
- **Vehicle detail** page with a full itemised cost breakdown.
- **Pricing calculator** (client-side, same formula as the server).
- **Public tracking** (`/track`) — anyone with an order number sees the live journey, **no login required**.
- **Customer app** (`/app`) — zero page reloads: dashboard → order → timeline → payments.
- **Admin app** — advance stages, attach evidence (auction sheets, receipts, photos), verify payments.
- **Chatbot** — website widget **and** WhatsApp: answers questions and looks up order status by order number.
- **Printable invoice** with full breakdown, paid vs balance due.

**The 10-stage pipeline** (defined in `models.py`):
`Quote → Bidding in Japan → Auction Won → Deposit Confirmed → Shipping → Arrived at Port → Customs & Duty → Clearing & Inspection → Road Transport → Delivered`.

Every stage has an icon, a default description, a timestamp, a note, and optional
**evidence URL** (auction sheet, shipping receipt, duty receipt, photos).

---

## 5. Legal, Customs & Compliance (Zimbabwe)

> **Indicative guidance only. Engage a licensed clearing agent and verify with
> ZIMRA before trading.**

1. **Register the business** — a limited company or registered business in Zimbabwe; open a USD account (the market transacts heavily in USD).
2. **Import duty & VAT** — used vehicles attract customs duty, **surtax** and **VAT (15%)**. The exact formula depends on vehicle age and engine capacity, and rates change. Our `config.py` holds adjustable defaults; always confirm the final figure with the clearing agent **before** the client commits.
3. **Clearing agent** — a licensed clearing agent at the port (Beira or Durban) handles duty payment, customs documentation and physical inspection.
4. **Port routes** — commonly **Beira (Mozambique)** or **Durban (SA)**, then road transport to Harare (via Beitbridge or Forbes border). RO-RO or shared-container shipping from Japan.
5. **Vehicle identity / inspection** — post-import inspection (VID-type checks / police clearance) before registration and number plates.
6. **Customer contract** — always sign an order agreement covering: fixed commission, deposit terms, duty estimate caveat, delivery timeline, and dispute resolution. Keep receipts for everything — that's our brand.

---

## 6. Payments (Zimbabwe reality)

- **EcoCash** — must-have; dominant mobile money wallet.
- **InnBucks, OneMoney** — secondary wallets.
- **Bank transfer (USD / RTGS)** — for larger deposits and diaspora.
- The platform supports **all of the above**: customers submit the transaction reference on their dashboard, and the admin **verifies** it (it then counts toward the paid total automatically).
- **Startup note:** EcoCash merchant accounts / bank integration APIs come later. For MVP, payment references are confirmed manually (fast — this is the honest, trust-building approach) and the record lives on the customer's order.

---

## 7. Marketing & Channels

- **WhatsApp Business** is the primary sales channel in Zim — the chatbot runs the same logic on WhatsApp (blueprint included in `whatsapp.py`).
- **Facebook + TikTok**: short videos of auction wins, ship departures, port arrivals — visual proof of transparency. "Track your car live" is a shareable hook.
- **Diaspora communities** (UK/SA/US groups) — biggest trust gap, biggest willingness to pay USD.
- **Referrals** — a verified, delivered car is the best ad. Offer a small referral credit.
- **Local SEO**: "import car from Japan Zimbabwe", "Toyota Vitz for sale Harare" etc.
- **Testimonials with evidence** — real timelines, real receipts.

---

## 8. Operations Playbook (per order)

1. **Source** — friend in Japan searches auctions; shortlist + auction sheets + photos shared with the customer.
2. **Bid** — customer approves price band; we bid. Show the live auction sheet.
3. **Win → deposit** — invoice + deposit request; customer pays via wallet/bank and submits reference.
4. **Export & ship** — export docs, RO-RO/container booking; update stage "Shipping" with vessel name + ETA.
5. **Port arrival** — update stage, attach arrival notice.
6. **Customs & duty** — clearing agent pays duty/VAT; upload receipts as evidence.
7. **Inspection & clearing** — physical inspection, release.
8. **Road transport** — trucking to Harare; update ETA.
9. **Delivery** — balance due, handover, registration assistance.

**Service-level promise:** every stage updated within 24 hours of the event, with evidence attached. That's the SLA that builds the brand.

---

## 9. Financial Snapshot (indicative)

- **Revenue model:** fixed commission × cars delivered (+ optional transport/registration fees, disclosed).
- **Cash cycle:** deposit covers ~20–35% of landed cost; freight/duty funded by float or short credit. Balance settles at delivery.
- **Breakeven thinking:** at `$850`/car, 12 cars/month ≈ `$10,200` gross commission/month — the volume target depends on costs (auction agent, freight float, clearing, marketing, salaries).
- **Unit targets:** start with **3–5 cars/month**, scale to **15–20/month** once logistics + float are proven.

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| ZIMRA duty changes | Always re-verify before quoting; publish estimates as estimates; clearing agent confirms final. |
| Exchange rate / ZWL exposure | Price and contract in **USD**; collect deposits in USD-equivalent via USD accounts. |
| Freight delays / port congestion | Realistic ETAs in every update; buffer in the timeline; live tracking keeps trust. |
| Vehicle condition surprises | Share the **auction sheet** before bidding; grade and photos are evidence; customer approves before we bid. |
| Float / cash-flow strain | Conservative volume growth; deposits before shipping; keep a reserve. |
| Fraud / impersonation | Verified payments only; official wallet numbers published on the site; never change payment details mid-chat. |
| Regulation | Licensed clearing agent; proper registration; keep full paper trail. |

---

## 11. KPIs (track these weekly)

- Cars listed → orders created (conversion)
- Orders → auction-won (bid win rate)
- Auction-won → delivered (fulfilment %)
- **Average time per stage** (we should be fast AND transparent)
- Deposit → verified time (we commit to < 24h)
- Customer NPS / referral rate
- WhatsApp + chatbot conversations → qualified leads

---

## 12. Phased Roadmap

| Phase | Focus |
|---|---|
| **Phase 1 — MVP (this repo)** | Public site + catalog + landing costs, customer app with tracking & payments, admin app, chatbot (web + WhatsApp blueprint), EcoCash/bank via reference verification. |
| **Phase 2 — Trust builders** | Real auction sheet uploads, SMS/WhatsApp status notifications, review system, referral credits, mobile-money merchant integration. |
| **Phase 3 — Scale** | Payment gateway integrations (EcoCash merchant API), real shipping API tracking, multi-port support, fleet/bulk deals, diaspora payment rails. |

---

*"You will see every cost, every receipt, and every stage of your car's journey.
We earn one clearly-stated commission — and nothing else, ever."*

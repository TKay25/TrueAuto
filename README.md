# True Auto Zim 🚗🇯🇵→🇿🇼

**Quality used cars imported from Japanese auctions to Zimbabwe — with total transparency.**

A complete web platform to run a Japan → Zimbabwe car import business:

- 🌐 Public marketing site (catalog, landed-cost breakdowns, pricing calculator, "how it works")
- 📦 Live 10-stage **order tracking** from auction to delivery, public + per-customer
- 📱 A **zero-redirect app** (`/app`) — login, dashboard, tracking & payments all swap client-side
- 💰 Payment support for **EcoCash, InnBucks, OneMoney & bank transfer** (reference-based verification)
- 🤖 **Chatbot** on the website and a **WhatsApp** blueprint — answers questions and tracks orders by number
- 🛠️ **Admin app** — advance stages, attach evidence, verify payments, manage vehicles, handle enquiries & requests
- 🧾 Printable **invoices** with the full itemised cost breakdown

## Features that surpass BeForward 🚀
- 🔍 **Advanced filters + pagination** (price/year/mileage/fuel/transmission) and make chips
- ❤️ **Wishlist ("My List")** + ⚖️ **Compare up to 4 cars** side-by-side
- 🏷️ **Browse by Brand** and 🕓 **Recently viewed**
- 🛒 **Request-a-Car (source-on-demand)** — get any car sourced from Japan even if it's not in the catalog
- 🇿🇼 **Port route selector** — choose **Beira 🇲🇿 or Durban 🇿🇦**, freight & transport adjust automatically
- 💳 **Installment / lay-by estimator** — deposit + months + interest → monthly payment
- 📚 **Auction grade glossary** page — learn to read auction sheets
- ⭐ **Verified customer reviews** on delivered cars (shown on the homepage)
- 💵 **Every number formatted** as `#,##0.00` — no surprises

---

## Quick start (Windows / PowerShell)

```powershell
# 1. Install dependencies
py -m pip install -r requirements.txt

# 2. Seed the database (demo users, 10 vehicles, sample order)
py seed.py

# 3. Run the server
py app.py
```

Open **http://127.0.0.1:5001**

> Prefer a venv: `py -m venv .venv` then `.\.venv\Scripts\Activate.ps1` before step 1.

---

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@trueautozim.co.zw` | `Admin123!` 🔴 change this |
| Customer | `demo@trueautozim.co.zw` | `Demo123!` |

Demo order `TA-2026-0001` (Toyota Harrier) ships with a full tracking timeline
so you can see the whole transparency system working immediately.

---

## Key pages

| URL | What it is |
|---|---|
| `/` | Homepage |
| `/catalog` | Live catalog (search/filter/sort/pagination — JS driven) |
| `/catalog/<slug>` | Vehicle detail with full landed-cost breakdown + port selector |
| `/brands` | Browse by make |
| `/compare` | Side-by-side comparison |
| `/request-a-car` | Source-on-demand — request any car |
| `/grades` | Japanese auction grades explained |
| `/pricing` | Port-aware landed-cost calculator + installment estimator |
| `/track` | Public tracking — enter an order number, no login needed |
| `/track?order=TA-2026-0001` | See the demo order live |
| `/app` | **The app** — zero page reloads (login, dashboard, tracking, admin) |
| `/invoice/1` | Printable invoice (customer only) |
| `/admin` | Server-rendered admin fallback |

---

## Configuration

Copy `.env.example` to `.env` and set:

- `SECRET_KEY` — generate one: `py -c "import secrets; print(secrets.token_hex(32))"`
- `CONTACT_PHONE` / `CONTACT_EMAIL` — your real business details
- `DUTY_RATE`, `SURTAX_RATE`, `VAT_RATE`, `FREIGHT_USD`, `COMMISSION_FLAT`, … — the cost model
- `OPENAI_API_KEY` — optional smarter chatbot
- `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` / `WHATSAPP_VERIFY_TOKEN` — WhatsApp Cloud API

> ⚠️ Duty & tax figures are indicative. Verify with ZIMRA / a licensed clearing
> agent before quoting clients — then update the numbers in `.env`.

---

## Project structure

```
app.py / config.py / extensions.py / models.py / pricing.py
chatbot.py / whatsapp.py / routes.py / api.py / seed.py / smoke_test.py
templates/    # Jinja2 (base, pages, partials, admin/)
static/
  css/style.css     # brand design system
  js/               # app.js (SPA engine), chatbot.js, catalog.js, track.js, calculator.js, main.js
docs/
  BUSINESS_PLAN.md  # the business plan
  ARCHITECTURE.md   # technical design
  ROADMAP.md        # what's next
```

---

## Useful commands

```powershell
py seed.py                 # reset + reseed demo data
py smoke_test.py           # verify every route returns OK
py app.py                  # run dev server on :5001
```

---

## Docs

- [Business plan](docs/BUSINESS_PLAN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)

---

**"You will see every cost, every receipt, and every stage of your car's journey.
We earn one clearly-stated commission — and nothing else, ever."**

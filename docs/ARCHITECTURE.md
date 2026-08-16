# True Auto Zim — Technical Architecture

Flask (Python) + Bootstrap 5 + vanilla JavaScript, styled to feel like a modern
single-page app (SPA). All Python files live in the project root; templates in
`templates/`; static assets in `static/`.

---

## 1. Stack

| Layer | Technology |
|---|---|
| Backend | Flask 3, Flask-SQLAlchemy, Flask-Login |
| Database | SQLite (`trueauto.db`) — swap to PostgreSQL for production |
| Frontend | Bootstrap 5.3 (CDN), Bootstrap Icons, custom `style.css` |
| App engine | Vanilla JS (`static/js/app.js`) — hash-routed SPA, zero redirects |
| Chatbot | Rule-based engine (`chatbot.py`) + optional OpenAI boost |
| WhatsApp | Meta Cloud API blueprint (`whatsapp.py`) |

---

## 2. Project layout

```
TrueAuto/
├── app.py            # Flask app factory + template globals
├── config.py         # All business/config values (duty, fees, commission…)
├── extensions.py     # db + login_manager (shared, avoids circular imports)
├── models.py         # User, Vehicle, Order, TrackingEvent, Payment + PIPELINE_STAGES
├── pricing.py        # Landed-cost engine (single source of truth for pricing)
├── chatbot.py        # Conversation engine (web + WhatsApp)
├── whatsapp.py       # Meta WhatsApp Cloud API (send + webhook)
├── routes.py         # Server-rendered pages + forms (SEO-friendly)
├── api.py            # JSON API (powers the SPA + chatbot + WhatsApp)
├── seed.py           # Demo data (run once)
├── smoke_test.py     # Route smoke test
├── requirements.txt
├── .env.example      # Copy to .env
├── templates/        # Jinja2 templates (base, pages, partials, admin/)
└── static/
    ├── css/style.css # Brand design system (crimson/deep blue/green/grey/white)
    └── js/           # main.js, app.js, chatbot.js, catalog.js, track.js, calculator.js
```

---

## 3. Data model (core)

```
User 1───* Order *───1 Vehicle
Order 1───* TrackingEvent   (the pipeline history)
Order 1───* Payment         (EcoCash / InnBucks / OneMoney / bank)
```

**PIPELINE_STAGES** (`models.py`) — the fixed 10-stage journey. `Order.status`
holds the current stage key; `TrackingEvent` records every stage transition
with note + optional evidence URL + timestamp.

---

## 4. Pricing engine — single source of truth

- `pricing.py::compute_landed_cost()` computes the itemised landed cost from
  configurable rates in `config.py` / `.env`.
- The **server** uses it for every estimate (catalog cards, detail pages, invoices).
- The **client** calculator (`calculator.js`) uses the same formula fed by
  `/api/config` → always in sync.
- Keep rates updated as ZIMRA/freight changes — every price updates automatically.

---

## 5. The zero-redirect app (`/app`)

- `routes.app` renders one shell (`templates/app.html`): top bar, tab strip, view container.
- `static/js/app.js` is a small hash router: `#/dashboard`, `#/orders/3`,
  `#/cars/<slug>`, `#/track`, `#/admin/orders/1`, …
- **No page redirects**: login/register, dashboard, tracking, payments, admin —
  all swapped client-side via `fetch` to the JSON API. The back button still works
  via URL hashes.
- Views re-render on a 30s interval (live tracking) and on admin actions.
- Auth is enforced on the API too (Flask-Login session cookie), so the SPA is
  just a faster front-end — not a security shortcut.

---

## 6. Chatbot & WhatsApp

- `chatbot.py::handle_message()` is the single brain:
  1. Detects an order number → queries the DB and returns live status.
  2. Matches intents (pricing, payments, how-it-works, duty, contact…).
  3. Falls back to OpenAI if `OPENAI_API_KEY` is set, else a helpful default.
- Web widget: `templates/partials/chat_widget.html` + `static/js/chatbot.js` → `POST /api/chat`.
- WhatsApp: `whatsapp.py` sends/receives via Meta Cloud API; the webhook at
  `GET|POST /api/whatsapp/webhook` routes messages through the same chatbot.

### To activate WhatsApp
1. Create a Meta Business app + WhatsApp Business account.
2. Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN` in `.env`.
3. Point the webhook to `https://your-domain.com/api/whatsapp/webhook` and subscribe to `messages`.

---

## 7. Security notes (production)

- Change `SECRET_KEY`; never commit `.env`.
- The dev server (`app.py`) is for development. Deploy with **Gunicorn/Waitress** + reverse proxy.
- Add HTTPS, rate limiting on `/api/auth/*` and `/api/chat`, and CSRF for server forms.
- For real payments, integrate EcoCash merchant / bank APIs and store references server-side only.
- Password hashes use Werkzeug (PBKDF2) by default — fine for MVP.

# True Auto Zim — Product Roadmap

## Phase 1 — MVP ✅ (built in this repo)
- [x] Public site: homepage, catalog, vehicle detail with landed-cost breakdown
- [x] Pricing calculator (client + server share one formula)
- [x] Public tracking by order number (no login)
- [x] Zero-redirect customer app: login → dashboard → order tracking → payments
- [x] Admin app: advance stages, attach evidence, verify payments, manage vehicles
- [x] Chatbot on the website (order lookup + FAQs)
- [x] WhatsApp chatbot blueprint + webhook
- [x] Printable invoice with full cost breakdown
- [x] Seed data + route smoke test

## Phase 2 — Trust builders
- [ ] Real auction-sheet uploads and photos (replace placeholders)
- [ ] Automated **SMS/WhatsApp status notifications** on every stage change
- [ ] Customer reviews + ratings (with real tracking evidence)
- [ ] Referral credit system
- [ ] Mobile-money **merchant integration** (EcoCash API) for online deposits
- [ ] Order agreement / terms acceptance before deposit
- [ ] Admin notifications (pending payments, new orders)

## Phase 3 — Scale
- [ ] Real shipping/container tracking APIs
- [ ] Multi-port support (Beira + Durban + Beitbridge options) with live rate quotes
- [ ] Diaspora payment rails (cards/Stripe-like for USD buyers abroad)
- [ ] Fleet / bulk-buy deals with custom quotes
- [ ] Analytics dashboard (funnel, KPI tracking)
- [ ] PostgreSQL + production deployment (Gunicorn/Waitress + HTTPS)

---

## Suggested immediate next steps (this week)
1. **Reseed & change admin password** (`seed.py` output shows the defaults).
2. **Fill `.env`**: `SECRET_KEY`, your real contact details, WhatsApp credentials.
3. **Upload real vehicle photos** — put URLs in the photos field (JSON array) on each vehicle; the placeholder gradient disappears automatically.
4. **Connect WhatsApp** and reply to your first enquiry through the bot.
5. **Verify duty numbers** with a clearing agent and update `config.py` / `.env` so every quote is accurate.
6. Get your first 2–3 orders flowing, then market the *live tracking* feature hard.

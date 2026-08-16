"""True Auto Zim — conversational assistant.

Works out of the box with a built-in knowledge base + live order tracking.
If OPENAI_API_KEY is set, it also boosts replies with an LLM for anything
outside the knowledge base.

The widget and WhatsApp both call `handle_message()` so behaviour is identical
across channels.
"""
import re
from datetime import datetime

from config import Config

# ---------------------------------------------------------------------------
# Knowledge base
# ---------------------------------------------------------------------------
KB = {
    "how_it_works": (
        "Here's how we work 🤝\n\n"
        "1. Pick a car from our catalog or tell us what you want.\n"
        "2. We bid at Japanese auctions in real time (auction sheet + photos shared).\n"
        "3. Pay a deposit via EcoCash / InnBucks / OneMoney / bank transfer.\n"
        "4. We ship, clear customs and deliver to you in Zimbabwe.\n"
        "5. Track every stage live — auction, shipping, port, customs, delivery.\n\n"
        "Full transparency, no hidden costs. That's the True Auto promise."
    ),
    "pricing": (
        f"We charge ONE fixed auction & shipping assistance fee of "
        f"${Config.COMMISSION_FLAT:,.0f} per car — it covers us helping you bid, "
        "buy and ship from the Japanese auction. That's it. You see every cost "
        "line itemised: Japan auction price (FOB), freight, insurance, duty, VAT "
        "and port handling — all passed through at cost. Clearing to Harare is "
        "optional (we can arrange it, or you clear the car yourself at the port). "
        "No mark-ups, no surprises."
    ),
    "landed_cost": (
        "Your total = Japan price + freight + insurance + import duty + VAT + "
        "port handling + our fixed auction & shipping fee. Clearing + delivery "
        "to Harare is optional and added only if you want us to arrange it. "
        "All costs except our fee are passed through at cost. "
        "Use the calculator on our Pricing page to get an instant estimate for any car."
    ),
    "duty": (
        "Import duty depends on the vehicle and current ZIMRA rates. As a guide "
        "we estimate duty + surtax + VAT on top of the CIF (car + freight + insurance) "
        "value. Your final quote always shows the exact ZIMRA breakdown — verified "
        "with our clearing agent before you commit."
    ),
    "deposit": (
        "A deposit is required once your auction bid wins. It secures the car and "
        "covers shipping costs. You can pay via EcoCash, InnBucks, OneMoney or bank "
        "transfer — then submit the payment reference on your dashboard and it gets "
        "verified instantly. We stay transparent about every payment."
    ),
    "payments": (
        "We accept EcoCash 💰, InnBucks, OneMoney and bank transfer (USD / RTGS). "
        "Once you pay, log in to your dashboard, submit the transaction reference "
        "and our team verifies it — you'll see it marked 'verified' on your order."
    ),
    "shipping_time": (
        "A typical journey: 2–4 weeks at auction, then 4–6 weeks shipping from "
        "Japan to Beira or Durban, then 1–2 weeks for customs, clearing and road "
        "transport to Harare. Total: roughly 8–12 weeks, and you track every stage live."
    ),
    "track": (
        "You can track any order two ways:\n"
        "• Public tracker: use the 'Track your car' page with your order number.\n"
        "• Dashboard: log in to see the full timeline, payments and auction evidence.\n\n"
        "Just tell me your order number (e.g. TA-2026-0001) and I'll fetch the latest status."
    ),
    "why_us": (
        "We cut out the middlemen. Most Zimbabweans buy Japan cars through agents "
        "who hide mark-ups. We show you the ACTUAL auction price and every cost to "
        "land the car in Harare, plus live tracking from auction to delivery. "
        "Transparency builds trust — that's our whole model."
    ),
    "contact": (
        f"📞 Call / WhatsApp: {Config.CONTACT_PHONE}\n"
        f"✉️ Email: {Config.CONTACT_EMAIL}\n"
        f"🕗 Hours: {Config.SUPPORT_HOURS}\n"
        f"📍 {Config.ADDRESS}"
    ),
    "request_car": (
        "Can't find your dream car in our catalog? No problem! 🚗\n\n"
        "We SOURCE cars to order from Japanese auctions — that's how we beat "
        "the big export sites:\n\n"
        "• Tell us the make, model, year range and your budget\n"
        "• We find real auction options and share the auction sheets\n"
        "• You approve, we bid, and you track it home — same transparent process\n\n"
        "Fill in the quick form here: https://trueautozim.co.zw/request-a-car "
        "or just tell me the car you want and your budget, and I'll note it for our team!"
    ),
    "welcome": (
        "👋 Welcome to True Auto Zim! I can help you:\n\n"
        "• 🚗 Browse cars and check landed prices\n"
        "• 📦 Track your order (just send your order number)\n"
        "• 💰 Explain pricing, deposits & payments\n"
        "• 🚢 Explain how the Japan→Zim process works\n\n"
        "What can I do for you today?"
    ),
}

# Intent matching: list of (keyword, intent)
INTENTS = [
    ("how does", "how_it_works"), ("how do you", "how_it_works"),
    ("process", "how_it_works"), ("how it works", "how_it_works"),
    ("step", "how_it_works"), ("procedur", "how_it_works"),
    ("price", "pricing"), ("pricing", "pricing"), ("fee", "pricing"),
    ("commission", "pricing"), ("charge", "pricing"),
    ("cost", "landed_cost"), ("how much", "landed_cost"), ("landed", "landed_cost"),
    ("duty", "duty"), ("tax", "duty"), ("vat", "duty"), ("zimra", "duty"), ("customs", "duty"),
    ("deposit", "deposit"), ("pay", "payments"), ("payment", "payments"),
    ("ecocash", "payments"), ("innbucks", "payments"), ("onemoney", "payments"),
    ("bank transfer", "payments"),
    ("how long", "shipping_time"), ("shipping", "shipping_time"), ("deliver", "shipping_time"),
    ("track", "track"), ("status", "track"), ("where is my", "track"),
    ("trust", "why_us"), ("why", "why_us"), ("legit", "why_us"), ("scam", "why_us"),
    ("contact", "contact"), ("phone", "contact"), ("whatsapp", "contact"),
    ("email", "contact"), ("address", "contact"),
    ("request a car", "request_car"), ("source", "request_car"),
    ("custom order", "request_car"), ("special order", "request_car"),
    ("not in catalog", "request_car"), ("can't find", "request_car"),
    ("find me", "request_car"), ("import for me", "request_car"),
]

ORDER_RE = re.compile(r"(TA[-_ ]?\d{4}[-_ ]?\d{3,6})", re.IGNORECASE)


def detect_intent(text):
    t = text.lower()
    for kw, intent in INTENTS:
        if kw in t:
            return intent
    return None


def _track_order(order_number):
    from models import Order
    normalized = re.sub(r"[-_ ]", "", order_number).upper()
    # search for exact or normalized match
    for order in Order.query.all():
        if order.order_number.upper() == normalized or re.sub(r"[-_ ]", "", order.order_number).upper() == normalized:
            from models import stage_label, TrackingEvent
            latest = order.events.order_by(TrackingEvent.created_at.desc()).first()
            paid = order.paid_total()
            out = order.outstanding_total()
            reply = (
                f"📦 Order {order.order_number}\n\n"
                f"🚗 {order.vehicle.full_title}\n"
                f"📍 Current stage: {stage_label(order.status)}\n"
            )
            if latest:
                ts = latest.created_at.strftime("%d %b %Y %H:%M") if latest.created_at else ""
                reply += f"🕗 {ts}: {latest.note or ''}\n"
            reply += f"\n💵 Paid: ${paid:,.0f} | Outstanding: ${out:,.0f}\n\n"
            reply += "Full timeline + evidence on your dashboard or the public tracker."
            return reply
    return (
        f"🤔 I couldn't find order '{order_number}'. "
        "Double-check the format (e.g. TA-2026-0001) — it's on your invoice "
        "and dashboard. Want me to help you track it differently?"
    )


def handle_message(text, user=None):
    """Main entry point for the chatbot. Returns {'reply': str, 'actions': [...]}."""
    text = (text or "").strip()
    if not text:
        return {"reply": "Ask me anything about buying or tracking a car! 🚗", "actions": []}

    # 1) Explicit order number in the message → track it
    match = ORDER_RE.search(text)
    if match or "track" in text.lower():
        token = match.group(1) if match else None
        if token:
            return {"reply": _track_order(token), "actions": []}

    # 2) Greetings / small talk
    low = text.lower()
    if any(g in low for g in ["hello", "hi ", "hey", "good morning", "good afternoon", "good evening", "mhoro", "howzit", "sveki"]):
        return {"reply": KB["welcome"], "actions": ["track", "catalog", "contact"]}

    # 3) Knowledge-base intents
    intent = detect_intent(text)
    if intent:
        return {"reply": KB[intent], "actions": []}

    # 4) LLM boost (optional) — fall back to helpful default
    if Config.OPENAI_API_KEY:
        reply = _llm_boost(text)
        if reply:
            return {"reply": reply, "actions": []}

    return {
        "reply": (
            "I'm not 100% sure about that one 😅 — but I can help with:\n\n"
            "• 🚗 How the process works\n"
            "• 💰 Pricing & our auction/shipping fee\n"
            "• 📦 Tracking your order (send your order number)\n"
            "• 💳 Payments (EcoCash, InnBucks, bank)\n"
            "• 📞 Contacting our team\n\n"
            "Which of these would you like?"
        ),
        "actions": ["track", "catalog", "contact"],
    }


def _llm_boost(text):
    """Optional: call an OpenAI-compatible chat completion. Returns str or None."""
    try:
        import requests
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {Config.OPENAI_API_KEY}"},
            json={
                "model": Config.OPENAI_MODEL,
                "messages": [
                    {"role": "system", "content": (
                        "You are the customer-support assistant for True Auto Zim, a "
                        "Zimbabwean company importing quality used cars from Japanese "
                        "auctions. Be friendly, concise and transparent. Mention the "
                        "fixed commission and live tracking when relevant. If asked for "
                        "order status, tell the user to send their order number."
                    )},
                    {"role": "user", "content": text},
                ],
                "max_tokens": 200,
            },
            timeout=20,
        )
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()
    except Exception:
        return None

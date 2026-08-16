"""WhatsApp Business Cloud API integration (Meta).

Blueprint for running the same chatbot over WhatsApp — the channel Zimbabweans
already live on. To activate:

1. Create a Meta Business app + WhatsApp Business account (business.facebook.com).
2. Generate a permanent token, copy the Phone Number ID.
3. Set WHATSAPP_TOKEN / WHATSAPP_PHONE_ID / WHATSAPP_VERIFY_TOKEN in .env.
4. Point the webhook at  https://yourdomain.com/api/whatsapp/webhook
   and subscribe to the 'messages' field.
"""
import requests

from config import Config

GRAPH_URL = "https://graph.facebook.com/v21.0"


def send_text(to_phone: str, body: str) -> bool:
    """Send a WhatsApp text message to a phone number (E.164, e.g. +2637...)."""
    if not Config.WHATSAPP_TOKEN or not Config.WHATSAPP_PHONE_ID:
        return False
    url = f"{GRAPH_URL}/{Config.WHATSAPP_PHONE_ID}/messages"
    headers = {
        "Authorization": f"Bearer {Config.WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "text",
        "text": {"body": body},
    }
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=20)
        return resp.status_code == 200
    except Exception:
        return False


def verify_webhook(mode, token, challenge):
    """Meta webhook verification (GET)."""
    if mode == "subscribe" and token == Config.WHATSAPP_VERIFY_TOKEN:
        return challenge
    return None


def handle_webhook(payload):
    """Process an incoming WhatsApp message and reply via the chatbot."""
    try:
        entry = payload["entry"][0]
        changes = entry["changes"][0]
        value = changes["value"]
        if "messages" not in value:
            return
        msg = value["messages"][0]
        from_phone = msg["from"]
        if msg.get("type") != "text":
            send_text(from_phone, "Sorry, I can only read text messages for now. 😅")
            return
        text = msg["text"]["body"]
        result = __import__("chatbot").handle_message(text)
        send_text(from_phone, result["reply"])
    except Exception:
        return

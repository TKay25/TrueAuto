"""True Auto Zim — notification service.

Every stage change (and payment event) creates an in-app Notification for the
customer, then best-effort pushes the same update out over WhatsApp and SMS so
nobody ever misses an update. If a channel isn't configured yet, it's skipped
silently — the in-app notification still always works.
"""
import requests

from config import Config
from extensions import db


def create_notification(user_id, title, body=None, order_id=None, kind="order"):
    """Store an in-app notification (does NOT commit — caller commits)."""
    from models import Notification
    n = Notification(user_id=user_id, order_id=order_id, kind=kind,
                     title=title, body=body)
    db.session.add(n)
    return n


def send_whatsapp(phone, body):
    """Best-effort WhatsApp push via Meta Cloud API."""
    from whatsapp import send_text
    return send_text(phone, body)


def send_sms(phone, body):
    """Best-effort SMS via Africa's Talking (popular in Zimbabwe)."""
    if not (Config.AT_USERNAME and Config.AT_API_KEY):
        return False
    try:
        resp = requests.post(
            "https://api.africastalking.com/version1/messaging",
            headers={
                "apiKey": Config.AT_API_KEY,
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "username": Config.AT_USERNAME,
                "to": phone,
                "message": body[:160],  # SMS length limit
            },
            timeout=15,
        )
        return resp.status_code == 201
    except Exception:
        return False


def _outbound_text(order_number, title, body):
    base = f"True Auto Zim 🚗\n{title}\n{body}"
    base += (f"\nTrack live: https://trueautozim.co.zw/track?order={order_number}")
    return base


def notify_order_update(order, stage_label_text, note=None, evidence_url=None):
    """Customer-facing push when an order changes stage.

    Always writes the in-app notification; attempts WhatsApp + SMS on top.
    """
    title = f"📦 {order.order_number} — {stage_label_text}"
    body = note or f"Your {order.vehicle.full_title} just moved to: {stage_label_text}."

    create_notification(order.user_id, title, body, order_id=order.id)
    db.session.commit()

    customer = order.customer
    if customer and customer.phone:
        text = _outbound_text(order.order_number, title, body)
        send_whatsapp(customer.phone, text)
        send_sms(customer.phone, text)

    return True


def notify_payment_verified(payment):
    """Customer-facing push when their payment is verified."""
    order = payment.order
    title = f"✅ Payment verified — {order.order_number}"
    body = (f"Your {payment.method.replace('_', ' ').title()} payment of "
            f"${payment.amount_usd:,.0f} (ref {payment.reference}) has been verified.")

    create_notification(order.user_id, title, body, order_id=order.id)
    db.session.commit()

    customer = order.customer
    if customer and customer.phone:
        text = _outbound_text(order.order_number, title, body)
        send_whatsapp(customer.phone, text)
        send_sms(customer.phone, text)

    return True

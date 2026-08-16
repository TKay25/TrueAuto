"""True Auto Zim — JSON API.

Powers all the "React-app feel" client-side interactions:
catalog filtering, live tracking updates, payments, the chatbot,
public order tracking and the admin panel.
"""
import json
import re

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user, login_user, logout_user

from extensions import db
from models import (
    User, Vehicle, Order, TrackingEvent, Payment, Notification, SavedVehicle,
    Inquiry, CarRequest, Review, stage_label, STAGE_INDEX, PIPELINE_STAGES,
    PAYMENT_METHODS, now_utc,
)
from pricing import estimate_for_vehicle, as_dict
from chatbot import handle_message

api = Blueprint("api", __name__, url_prefix="/api")


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------
def vehicle_json(v, include_estimate=False):
    data = {
        "id": v.id,
        "slug": v.slug,
        "make": v.make,
        "model": v.model,
        "year": v.year,
        "mileage_km": v.mileage_km,
        "transmission": v.transmission,
        "fuel": v.fuel,
        "engine_cc": v.engine_cc,
        "auction_grade": v.auction_grade,
        "auction_location": v.auction_location,
        "fob_price_usd": v.fob_price_usd,
        "freight_usd": v.freight_usd,
        "status": v.status,
        "featured": v.featured,
        "title": v.title,
        "full_title": v.full_title,
    }
    if include_estimate:
        data["landed"] = as_dict(estimate_for_vehicle(v))
    return data


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------
@api.get("/vehicles")
def list_vehicles():
    """Catalog listing with BeForward-style advanced filters + pagination."""
    q = (request.args.get("q") or "").strip().lower()
    makes = request.args.get("make")
    sort = request.args.get("sort", "newest")
    status = request.args.get("status", "available")
    fuel = request.args.get("fuel")
    transmission = request.args.get("transmission")

    def _float(name, default=0):
        try:
            return float(request.args.get(name) or default)
        except ValueError:
            return default

    def _int(name, default=0):
        try:
            return int(request.args.get(name) or default)
        except ValueError:
            return default

    price_min, price_max = _float("price_min"), _float("price_max")
    year_min, year_max = _int("year_min"), _int("year_max")
    mileage_max = _int("mileage_max")
    page = max(_int("page", 1), 1)
    per_page = min(max(_int("per_page", 12), 1), 48)

    query = Vehicle.query
    if status in ("available", "reserved", "sold"):
        query = query.filter_by(status=status)
    if q:
        like = f"%{q}%"
        query = query.filter(db.or_(
            Vehicle.make.ilike(like),
            Vehicle.model.ilike(like),
            Vehicle.year.cast(db.String).ilike(like),
        ))
    if makes:
        query = query.filter(Vehicle.make.in_(makes.split(",")))
    if fuel:
        query = query.filter(Vehicle.fuel == fuel)
    if transmission:
        query = query.filter(Vehicle.transmission == transmission)
    if price_min:
        query = query.filter(Vehicle.fob_price_usd >= price_min)
    if price_max:
        query = query.filter(Vehicle.fob_price_usd <= price_max)
    if year_min:
        query = query.filter(Vehicle.year >= year_min)
    if year_max:
        query = query.filter(Vehicle.year <= year_max)
    if mileage_max:
        query = query.filter(Vehicle.mileage_km <= mileage_max)

    if sort == "price_asc":
        query = query.order_by(Vehicle.fob_price_usd.asc())
    elif sort == "price_desc":
        query = query.order_by(Vehicle.fob_price_usd.desc())
    elif sort == "year_desc":
        query = query.order_by(Vehicle.year.desc())
    else:
        query = query.order_by(Vehicle.created_at.desc())

    total = query.count()
    vehicles = query.offset((page - 1) * per_page).limit(per_page).all()
    return jsonify({
        "vehicles": [vehicle_json(v, include_estimate=True) for v in vehicles],
        "meta": {
            "total": total, "page": page, "per_page": per_page,
            "pages": (total + per_page - 1) // per_page,
        },
    })


@api.get("/vehicles/<slug>")
def vehicle_detail(slug):
    v = Vehicle.query.filter_by(slug=slug).first_or_404()
    return jsonify(vehicle_json(v, include_estimate=True))


# ---------------------------------------------------------------------------
# Chatbot
# ---------------------------------------------------------------------------
@api.post("/chat")
def chat():
    data = request.get_json(silent=True) or {}
    msg = data.get("message", "")
    user = current_user if current_user.is_authenticated else None
    return jsonify(handle_message(msg, user=user))


# ---------------------------------------------------------------------------
# Public tracking (no login required — transparency is the selling point)
# ---------------------------------------------------------------------------
@api.get("/orders/public/<order_number>")
def public_order(order_number):
    order = Order.query.filter_by(order_number=order_number.upper()).first()
    if not order:
        return jsonify({"found": False}), 404

    events = [
        {
            "stage": e.stage,
            "label": stage_label(e.stage),
            "note": e.note or "",
            "evidence_url": e.evidence_url or "",
            "created_at": e.created_at.strftime("%d %b %Y, %H:%M") if e.created_at else "",
        }
        for e in order.events.order_by(TrackingEvent.created_at.asc())
    ]
    return jsonify({
        "found": True,
        "order_number": order.order_number,
        "status": order.status,
        "status_label": stage_label(order.status),
        "vehicle": vehicle_json(order.vehicle),
        "stage_index": order.stage_index(),
        "total_stages": len(PIPELINE_STAGES),
        "events": events,
        "paid_total": order.paid_total(),
        "total_estimate": order.total_estimate_usd,
        "outstanding": order.outstanding_total(),
        "created_at": order.created_at.strftime("%d %b %Y") if order.created_at else "",
    })


# ---------------------------------------------------------------------------
# Customer endpoints (login required)
# ---------------------------------------------------------------------------
@api.get("/orders")
@login_required
def my_orders():
    orders = (Order.query
              .filter_by(user_id=current_user.id)
              .order_by(Order.created_at.desc()).all())
    return jsonify({"orders": [
        {
            "id": o.id,
            "order_number": o.order_number,
            "vehicle": o.vehicle.full_title,
            "status": o.status,
            "status_label": stage_label(o.status),
            "stage_index": o.stage_index(),
            "total_estimate": o.total_estimate_usd,
            "paid_total": o.paid_total(),
            "created_at": o.created_at.strftime("%d %b %Y") if o.created_at else "",
        }
        for o in orders
    ]})


@api.get("/orders/<int:order_id>")
@login_required
def order_detail(order_id):
    order = Order.query.filter_by(id=order_id, user_id=current_user.id).first()
    if not order:
        return jsonify({"error": "Not found"}), 404
    return jsonify({
        "id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "status_label": stage_label(order.status),
        "stage_index": order.stage_index(),
        "total_stages": len(PIPELINE_STAGES),
        "vehicle": vehicle_json(order.vehicle),
        "events": [
            {
                "stage": e.stage,
                "label": stage_label(e.stage),
                "note": e.note or "",
                "evidence_url": e.evidence_url or "",
                "created_at": e.created_at.strftime("%d %b %Y, %H:%M") if e.created_at else "",
            }
            for e in order.events.order_by(TrackingEvent.created_at.asc())
        ],
        "payments": [
            {
                "id": p.id,
                "method": p.method,
                "method_label": PAYMENT_METHODS.get(p.method, {}).get("label", p.method),
                "amount_usd": p.amount_usd,
                "reference": p.reference,
                "status": p.status,
                "created_at": p.created_at.strftime("%d %b %Y, %H:%M") if p.created_at else "",
            }
            for p in order.payments
        ],
        "paid_total": order.paid_total(),
        "total_estimate": order.total_estimate_usd,
        "outstanding": order.outstanding_total(),
        "deposit_amount": order.deposit_amount_usd,
        "commission": order.commission_usd,
        "reviewed": Review.query.filter_by(order_id=order.id).first() is not None,
        "estimate": as_dict(estimate_for_vehicle(order.vehicle)),
        "pipeline": [{"key": s["key"], "label": s["label"], "icon": s["icon"]}
                      for s in PIPELINE_STAGES],
    })


@api.post("/orders/<int:order_id>/payments")
@login_required
def add_payment(order_id):
    order = Order.query.filter_by(id=order_id, user_id=current_user.id).first()
    if not order:
        return jsonify({"error": "Not found"}), 404

    data = request.get_json(silent=True) or {}
    method = data.get("method")
    amount = data.get("amount")
    reference = (data.get("reference") or "").strip()

    if method not in PAYMENT_METHODS:
        return jsonify({"error": "Invalid payment method"}), 400
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid amount"}), 400
    if amount <= 0 or not reference:
        return jsonify({"error": "Enter a valid amount and payment reference"}), 400

    pay = Payment(order_id=order.id, method=method, amount_usd=round(amount, 2),
                  reference=reference, status="pending")
    db.session.add(pay)
    db.session.commit()
    return jsonify({"ok": True, "payment_id": pay.id,
                    "message": "Payment submitted. Our team will verify it shortly."})


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------
@api.post("/admin/orders/<int:order_id>/advance")
@login_required
def admin_advance(order_id):
    if not current_user.is_admin:
        return jsonify({"error": "Forbidden"}), 403
    order = Order.query.get_or_404(order_id)
    data = request.get_json(silent=True) or {}
    stage = data.get("stage")
    note = (data.get("note") or "").strip()
    evidence = (data.get("evidence_url") or "").strip()

    if stage not in STAGE_INDEX:
        return jsonify({"error": "Invalid stage"}), 400

    order.status = stage
    ev = TrackingEvent(order_id=order.id, stage=stage,
                       note=note or None, evidence_url=evidence or None)
    db.session.add(ev)
    db.session.commit()
    # Push the update to the customer (in-app + WhatsApp/SMS best-effort)
    from notify import notify_order_update
    notify_order_update(order, stage_label(stage), note=note, evidence_url=evidence)
    return jsonify({"ok": True, "status_label": stage_label(stage)})


@api.post("/admin/payments/<int:payment_id>/verify")
@login_required
def admin_verify_payment(payment_id):
    if not current_user.is_admin:
        return jsonify({"error": "Forbidden"}), 403
    pay = Payment.query.get_or_404(payment_id)
    pay.status = "verified"
    pay.verified_at = now_utc()
    db.session.commit()
    # Push the confirmation to the customer
    from notify import notify_payment_verified
    notify_payment_verified(pay)
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Notifications (in-app)
# ---------------------------------------------------------------------------
@api.get("/notifications")
@login_required
def my_notifications():
    items = (Notification.query
             .filter_by(user_id=current_user.id)
             .order_by(Notification.created_at.desc())
             .limit(60).all())
    return jsonify({"notifications": [
        {
            "id": n.id,
            "kind": n.kind,
            "title": n.title,
            "body": n.body or "",
            "read": n.read,
            "order_id": n.order_id,
            "created_at": n.created_at.strftime("%d %b %Y, %H:%M") if n.created_at else "",
        }
        for n in items
    ]})


@api.get("/notifications/unread-count")
@login_required
def notifications_unread():
    count = (Notification.query
             .filter_by(user_id=current_user.id, read=False)
             .count())
    return jsonify({"count": count})


@api.post("/notifications/read-all")
@login_required
def notifications_read_all():
    Notification.query.filter_by(user_id=current_user.id, read=False).update({"read": True})
    db.session.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# WhatsApp webhook
# ---------------------------------------------------------------------------
@api.route("/whatsapp/webhook", methods=["GET", "POST"])
def whatsapp_webhook():
    from whatsapp import verify_webhook, handle_webhook
    if request.method == "GET":
        challenge = verify_webhook(
            request.args.get("hub.mode"),
            request.args.get("hub.verify_token"),
            request.args.get("hub.challenge"),
        )
        if challenge:
            return challenge, 200
        return "Verification failed", 403
    payload = request.get_json(silent=True) or {}
    handle_webhook(payload)
    return "OK", 200


# ---------------------------------------------------------------------------
# App-mode endpoints (power the zero-redirect single-page app)
# ---------------------------------------------------------------------------
def _user_json(u):
    return {
        "id": u.id, "name": u.name, "email": u.email, "phone": u.phone,
        "role": u.role, "is_admin": u.is_admin,
    }


@api.get("/me")
def me():
    if current_user.is_authenticated:
        return jsonify({"authenticated": True, "user": _user_json(current_user)})
    return jsonify({"authenticated": False, "user": None})


@api.get("/config")
def app_config():
    from config import Config
    makes = [m[0] for m in db.session.query(Vehicle.make).distinct().order_by(Vehicle.make)]
    return jsonify({
        "company": Config.COMPANY_NAME,
        "contact": Config.CONTACT_PHONE,
        "email": Config.CONTACT_EMAIL,
        "commission": Config.COMMISSION_FLAT,
        "jpy_per_usd": Config.JPY_PER_USD,
        "makes": makes,
        "fuels": ["Petrol", "Diesel", "Hybrid"],
        "transmissions": ["Automatic", "Manual"],
        "ports": Config.PORT_OPTIONS,
        "default_port": Config.DEFAULT_PORT,
        "payment_methods": PAYMENT_METHODS,
        "cost_model": {
            "duty_rate": Config.DUTY_RATE,
            "surtax_rate": Config.SURTAX_RATE,
            "vat_rate": Config.VAT_RATE,
            "insurance_rate": Config.INSURANCE_RATE,
            "auction_fees": Config.AUCTION_FEES,
            "port_handling": Config.PORT_HANDLING,
            "clearing_fee": Config.CLEARING_FEE,
            "inspection_fee": Config.INSPECTION_FEE,
            "transport_to_hre": Config.TRANSPORT_TO_HRE,
            "commission": Config.COMMISSION_FLAT,
            "freight": Config.FREIGHT_USD,
        },
    })


@api.post("/auth/login")
def auth_login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    pwd = data.get("password") or ""
    user = User.query.filter_by(email=email).first()
    if user and user.check_password(pwd):
        login_user(user)
        return jsonify({"ok": True, "user": _user_json(user)})
    return jsonify({"error": "Invalid email or password."}), 401


@api.post("/auth/register")
def auth_register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    phone = (data.get("phone") or "").strip()
    pwd = data.get("password") or ""
    if not name or not email or not phone or len(pwd) < 6:
        return jsonify({"error": "Please fill in all fields (password min 6 characters)."}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "An account with that email already exists."}), 409
    user = User(name=name, email=email, phone=phone, role="customer")
    user.set_password(pwd)
    db.session.add(user)
    db.session.commit()
    login_user(user)
    return jsonify({"ok": True, "user": _user_json(user)})


@api.post("/auth/logout")
def auth_logout():
    logout_user()
    return jsonify({"ok": True})


@api.post("/orders")
@login_required
def create_order():
    data = request.get_json(silent=True) or {}
    vehicle = Vehicle.query.get(data.get("vehicle_id"))
    if not vehicle:
        return jsonify({"error": "Vehicle not found."}), 404
    if vehicle.status != "available":
        return jsonify({"error": "That vehicle is no longer available."}), 400
    try:
        deposit = float(data.get("deposit") or 0)
    except (TypeError, ValueError):
        deposit = 0
    cost = estimate_for_vehicle(vehicle)
    if deposit <= 0:
        deposit = round(vehicle.fob_price_usd * 0.2, 2)
    order = Order(
        order_number=f"TA-{now_utc().year}-{Order.query.count() + 1:04d}",
        user_id=current_user.id,
        vehicle_id=vehicle.id,
        status="quote",
        deposit_amount_usd=deposit,
        commission_usd=cost.commission,
        total_estimate_usd=cost.total,
        notes=(data.get("notes") or "").strip() or None,
    )
    db.session.add(order)
    db.session.flush()
    db.session.add(TrackingEvent(
        order_id=order.id, stage="quote",
        note="Quote requested via the app. We'll confirm your order shortly."))
    vehicle.status = "reserved"
    db.session.commit()
    return jsonify({"ok": True, "order_id": order.id, "order_number": order.order_number})


# ---------------------------------------------------------------------------
# Admin app endpoints
# ---------------------------------------------------------------------------
def _vehicle_from_json(data, v=None):
    if v is None:
        v = Vehicle()
    v.make = (data.get("make") or "").strip()
    v.model = (data.get("model") or "").strip()
    v.year = int(data.get("year") or 2015)
    v.mileage_km = int(data.get("mileage_km") or 0)
    v.transmission = (data.get("transmission") or "Automatic").strip()
    v.fuel = (data.get("fuel") or "Petrol").strip()
    try:
        v.engine_cc = int(data["engine_cc"]) if data.get("engine_cc") else None
    except (TypeError, ValueError):
        v.engine_cc = None
    v.auction_grade = (data.get("auction_grade") or "").strip() or None
    v.auction_location = (data.get("auction_location") or "").strip() or None
    v.fob_price_usd = float(data.get("fob_price_usd") or 0)
    v.freight_usd = float(data.get("freight_usd") or 0)
    v.status = (data.get("status") or "available").strip()
    v.featured = bool(data.get("featured"))
    v.description = (data.get("description") or "").strip() or None
    v.auction_sheet = (data.get("auction_sheet") or "").strip() or None
    photos = data.get("photos") or []
    v.photos = json.dumps(photos if isinstance(photos, list) else [])
    if not v.slug:
        v.slug = re.sub(r"[^a-z0-9]+", "-",
                        f"{v.make} {v.model} {v.year}".lower()).strip("-")
    return v


@api.get("/admin/stats")
@login_required
def admin_stats():
    if not current_user.is_admin:
        return jsonify({"error": "Forbidden"}), 403
    verified = Payment.query.filter_by(status="verified").all()
    return jsonify({
        "vehicles": Vehicle.query.count(),
        "available": Vehicle.query.filter_by(status="available").count(),
        "reserved": Vehicle.query.filter_by(status="reserved").count(),
        "sold": Vehicle.query.filter_by(status="sold").count(),
        "orders": Order.query.count(),
        "customers": User.query.filter_by(role="customer").count(),
        "pending_payments": Payment.query.filter_by(status="pending").count(),
        "in_transit": Order.query.filter(Order.status.notin_(["quote", "delivered"])).count(),
        "revenue_verified": round(sum(p.amount_usd for p in verified), 2),
    })


@api.get("/admin/orders")
@login_required
def admin_orders_list():
    if not current_user.is_admin:
        return jsonify({"error": "Forbidden"}), 403
    orders = Order.query.order_by(Order.created_at.desc()).limit(300).all()
    return jsonify({"orders": [
        {
            "id": o.id, "order_number": o.order_number,
            "customer": o.customer.name, "customer_phone": o.customer.phone,
            "vehicle": o.vehicle.full_title,
            "status": o.status, "status_label": stage_label(o.status),
            "total_estimate": o.total_estimate_usd,
            "paid_total": o.paid_total(),
            "created_at": o.created_at.strftime("%d %b %Y") if o.created_at else "",
        }
        for o in orders
    ]})


@api.get("/admin/orders/<int:order_id>")
@login_required
def admin_order_api(order_id):
    if not current_user.is_admin:
        return jsonify({"error": "Forbidden"}), 403
    order = Order.query.get_or_404(order_id)
    return jsonify({
        "id": order.id, "order_number": order.order_number,
        "customer": {"name": order.customer.name, "phone": order.customer.phone,
                      "email": order.customer.email},
        "vehicle": vehicle_json(order.vehicle),
        "status": order.status,
        "status_label": stage_label(order.status),
        "stage_index": order.stage_index(),
        "estimate": as_dict(estimate_for_vehicle(order.vehicle)),
        "pipeline": [{"key": s["key"], "label": s["label"], "icon": s["icon"]}
                      for s in PIPELINE_STAGES],
        "events": [
            {"id": e.id, "stage": e.stage, "label": stage_label(e.stage),
             "note": e.note or "", "evidence_url": e.evidence_url or "",
             "created_at": e.created_at.strftime("%d %b %Y, %H:%M") if e.created_at else ""}
            for e in order.events.order_by(TrackingEvent.created_at.asc())
        ],
        "payments": [
            {"id": p.id, "method": p.method,
             "method_label": PAYMENT_METHODS.get(p.method, {}).get("label", p.method),
             "amount_usd": p.amount_usd, "reference": p.reference,
             "status": p.status, "note": p.note or "",
             "created_at": p.created_at.strftime("%d %b %Y, %H:%M") if p.created_at else ""}
            for p in order.payments
        ],
        "paid_total": order.paid_total(),
        "total_estimate": order.total_estimate_usd,
        "outstanding": order.outstanding_total(),
        "deposit_amount": order.deposit_amount_usd,
        "commission": order.commission_usd,
        "notes": order.notes or "",
    })


@api.get("/admin/vehicles")
@login_required
def admin_vehicles_list():
    if not current_user.is_admin:
        return jsonify({"error": "Forbidden"}), 403
    vs = Vehicle.query.order_by(Vehicle.created_at.desc()).all()
    return jsonify({"vehicles": [vehicle_json(v, include_estimate=True) for v in vs]})


@api.post("/admin/vehicles")
@login_required
def admin_vehicle_create():
    if not current_user.is_admin:
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json(silent=True) or {}
    v = _vehicle_from_json(data)
    db.session.add(v)
    db.session.commit()
    return jsonify({"ok": True, "vehicle": vehicle_json(v, include_estimate=True)})


@api.put("/admin/vehicles/<int:vehicle_id>")
@login_required
def admin_vehicle_update(vehicle_id):
    if not current_user.is_admin:
        return jsonify({"error": "Forbidden"}), 403
    v = Vehicle.query.get_or_404(vehicle_id)
    data = request.get_json(silent=True) or {}
    v = _vehicle_from_json(data, v)
    db.session.commit()
    return jsonify({"ok": True, "vehicle": vehicle_json(v, include_estimate=True)})


@api.delete("/admin/vehicles/<int:vehicle_id>")
@login_required
def admin_vehicle_delete(vehicle_id):
    if not current_user.is_admin:
        return jsonify({"error": "Forbidden"}), 403
    v = Vehicle.query.get_or_404(vehicle_id)
    db.session.delete(v)
    db.session.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Compare (fetch several vehicles at once for the comparison table)
# ---------------------------------------------------------------------------
@api.get("/vehicles/compare")
def vehicles_compare():
    ids = [i for i in (request.args.get("ids") or "").split(",") if i.strip().isdigit()]
    vehicles = (Vehicle.query.filter(Vehicle.id.in_(ids)).all() if ids else [])
    return jsonify({"vehicles": [vehicle_json(v, include_estimate=True) for v in vehicles]})


# ---------------------------------------------------------------------------
# Wishlist (BeForward-style saved cars — 'My List')
# ---------------------------------------------------------------------------
@api.get("/wishlist")
@login_required
def wishlist():
    saved = (SavedVehicle.query
             .filter_by(user_id=current_user.id)
             .order_by(SavedVehicle.created_at.desc())
             .all())
    return jsonify({"vehicles": [vehicle_json(s.vehicle, include_estimate=True) for s in saved]})


@api.get("/wishlist/ids")
@login_required
def wishlist_ids():
    ids = [s.vehicle_id for s in SavedVehicle.query.filter_by(user_id=current_user.id).all()]
    return jsonify({"ids": ids})


@api.post("/wishlist")
@login_required
def wishlist_add():
    data = request.get_json(silent=True) or {}
    vehicle = Vehicle.query.get(data.get("vehicle_id"))
    if not vehicle:
        return jsonify({"error": "Vehicle not found."}), 404
    if not SavedVehicle.query.filter_by(user_id=current_user.id, vehicle_id=vehicle.id).first():
        db.session.add(SavedVehicle(user_id=current_user.id, vehicle_id=vehicle.id))
        db.session.commit()
    return jsonify({"ok": True})


@api.delete("/wishlist/<int:vehicle_id>")
@login_required
def wishlist_remove(vehicle_id):
    SavedVehicle.query.filter_by(user_id=current_user.id, vehicle_id=vehicle_id).delete()
    db.session.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Inquiries (per-vehicle enquiry form)
# ---------------------------------------------------------------------------
@api.post("/inquiries")
def create_inquiry():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    phone = (data.get("phone") or "").strip()
    if not name or not phone:
        return jsonify({"error": "Please provide your name and phone number."}), 400

    vehicle = Vehicle.query.get(data.get("vehicle_id")) if data.get("vehicle_id") else None
    inquiry = Inquiry(
        vehicle_id=vehicle.id if vehicle else None,
        name=name,
        phone=phone,
        email=(data.get("email") or "").strip() or None,
        message=(data.get("message") or "").strip() or None,
        source=(data.get("source") or "website"),
    )
    db.session.add(inquiry)
    db.session.commit()
    return jsonify({"ok": True, "id": inquiry.id})


@api.get("/admin/inquiries")
@login_required
def admin_inquiries():
    if not current_user.is_admin:
        return jsonify({"error": "Forbidden"}), 403
    items = (Inquiry.query.order_by(Inquiry.created_at.desc()).limit(300).all())
    return jsonify({"inquiries": [
        {
            "id": i.id,
            "vehicle": i.vehicle.full_title if i.vehicle else "General",
            "name": i.name,
            "phone": i.phone,
            "email": i.email or "",
            "message": i.message or "",
            "source": i.source,
            "status": i.status,
            "created_at": i.created_at.strftime("%d %b %Y, %H:%M") if i.created_at else "",
        }
        for i in items
    ]})


@api.post("/admin/inquiries/<int:inquiry_id>/status")
@login_required
def admin_inquiry_status(inquiry_id):
    if not current_user.is_admin:
        return jsonify({"error": "Forbidden"}), 403
    inquiry = Inquiry.query.get_or_404(inquiry_id)
    data = request.get_json(silent=True) or {}
    new_status = (data.get("status") or "").strip()
    if new_status not in ("new", "replied", "closed"):
        return jsonify({"error": "Invalid status"}), 400
    inquiry.status = new_status
    db.session.commit()
    return jsonify({"ok": True, "status": new_status})


# ---------------------------------------------------------------------------
# Source-on-demand car requests (surpasses BeForward)
# ---------------------------------------------------------------------------
@api.post("/requests")
def create_request():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    phone = (data.get("phone") or "").strip()
    if not name or not phone:
        return jsonify({"error": "Please provide your name and phone number."}), 400

    def _int(k):
        try:
            return int(data.get(k)) if data.get(k) else None
        except (TypeError, ValueError):
            return None

    def _float(k):
        try:
            return float(data.get(k)) if data.get(k) else None
        except (TypeError, ValueError):
            return None

    req = CarRequest(
        name=name,
        phone=phone,
        email=(data.get("email") or "").strip() or None,
        make=(data.get("make") or "").strip() or None,
        model=(data.get("model") or "").strip() or None,
        year_min=_int("year_min"),
        year_max=_int("year_max"),
        budget_max_usd=_float("budget_max_usd"),
        fuel=(data.get("fuel") or "").strip() or None,
        notes=(data.get("notes") or "").strip() or None,
    )
    db.session.add(req)
    db.session.commit()
    return jsonify({"ok": True, "id": req.id})


@api.get("/admin/requests")
@login_required
def admin_requests():
    if not current_user.is_admin:
        return jsonify({"error": "Forbidden"}), 403
    items = (CarRequest.query.order_by(CarRequest.created_at.desc()).limit(300).all())
    return jsonify({"requests": [
        {
            "id": r.id, "title": r.title(),
            "name": r.name, "phone": r.phone, "email": r.email or "",
            "make": r.make or "", "model": r.model or "",
            "year_min": r.year_min, "year_max": r.year_max,
            "budget_max_usd": r.budget_max_usd, "fuel": r.fuel or "",
            "notes": r.notes or "", "status": r.status,
            "created_at": r.created_at.strftime("%d %b %Y, %H:%M") if r.created_at else "",
        }
        for r in items
    ]})


@api.post("/admin/requests/<int:request_id>/status")
@login_required
def admin_request_status(request_id):
    if not current_user.is_admin:
        return jsonify({"error": "Forbidden"}), 403
    req = CarRequest.query.get_or_404(request_id)
    data = request.get_json(silent=True) or {}
    new_status = (data.get("status") or "").strip()
    if new_status not in ("new", "sourcing", "sourced", "closed"):
        return jsonify({"error": "Invalid status"}), 400
    req.status = new_status
    db.session.commit()
    return jsonify({"ok": True, "status": new_status})


# ---------------------------------------------------------------------------
# Reviews (customer feedback on delivered orders)
# ---------------------------------------------------------------------------
@api.get("/reviews")
def public_reviews():
    items = (Review.query.filter_by(approved=True)
             .order_by(Review.created_at.desc()).limit(9).all())
    return jsonify({"reviews": [
        {
            "id": r.id,
            "rating": r.rating,
            "comment": r.comment or "",
            "customer": r.user.name.split()[0],
            "vehicle": r.vehicle.full_title,
            "created_at": r.created_at.strftime("%d %b %Y") if r.created_at else "",
        }
        for r in items
    ]})


@api.post("/reviews")
@login_required
def create_review():
    data = request.get_json(silent=True) or {}
    order = Order.query.filter_by(id=data.get("order_id"), user_id=current_user.id).first()
    if not order:
        return jsonify({"error": "Order not found."}), 404
    if order.status != "delivered":
        return jsonify({"error": "You can only review a delivered car."}), 400
    if Review.query.filter_by(order_id=order.id).first():
        return jsonify({"error": "You already reviewed this order."}), 400
    try:
        rating = int(data.get("rating"))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid rating."}), 400
    if not 1 <= rating <= 5:
        return jsonify({"error": "Rating must be 1–5 stars."}), 400
    review = Review(
        order_id=order.id, user_id=current_user.id, vehicle_id=order.vehicle_id,
        rating=rating, comment=(data.get("comment") or "").strip() or None,
        approved=False,
    )
    db.session.add(review)
    db.session.commit()
    return jsonify({"ok": True, "id": review.id})


@api.get("/admin/reviews")
@login_required
def admin_reviews():
    if not current_user.is_admin:
        return jsonify({"error": "Forbidden"}), 403
    items = (Review.query.order_by(Review.created_at.desc()).limit(300).all())
    return jsonify({"reviews": [
        {
            "id": r.id, "rating": r.rating, "comment": r.comment or "",
            "customer": r.user.name, "vehicle": r.vehicle.full_title,
            "approved": r.approved,
            "created_at": r.created_at.strftime("%d %b %Y") if r.created_at else "",
        }
        for r in items
    ]})


@api.post("/admin/reviews/<int:review_id>/approve")
@login_required
def admin_review_approve(review_id):
    if not current_user.is_admin:
        return jsonify({"error": "Forbidden"}), 403
    review = Review.query.get_or_404(review_id)
    data = request.get_json(silent=True) or {}
    review.approved = bool(data.get("approved", True))
    db.session.commit()
    return jsonify({"ok": True, "approved": review.approved})

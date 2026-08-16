"""True Auto Zim — database models.

The pipeline below is our *transparency story*: every order publicly shows
its exact stage in the Japan → Zimbabwe journey, with evidence at each step.
"""
import json
from datetime import datetime, timezone

from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

from extensions import db, login_manager

# ---------------------------------------------------------------------------
# PIPELINE — the full journey of every order
# ---------------------------------------------------------------------------
PIPELINE_STAGES = [
    {"key": "quote",      "label": "Quote Requested",       "icon": "📝",
     "desc": "We received your request and are sourcing the best options from Japan."},
    {"key": "auction",    "label": "Bidding in Japan",      "icon": "🔨",
     "desc": "Your vehicle is live at a Japanese auction house."},
    {"key": "won",        "label": "Auction Won",           "icon": "🎉",
     "desc": "Congrats! Your car won at auction in Japan. Deposit is now due."},
    {"key": "deposit",    "label": "Deposit Confirmed",     "icon": "💰",
     "desc": "Deposit received and verified. Thank you for your trust."},
    {"key": "shipping",   "label": "Shipping from Japan",   "icon": "🚢",
     "desc": "Your vehicle is on a vessel heading to port (Beira / Durban)."},
    {"key": "port",       "label": "Arrived at Port",       "icon": "⚓",
     "desc": "Vehicle arrived at port — awaiting customs."},
    {"key": "customs",    "label": "Customs & Duty",        "icon": "🏛️",
     "desc": "Clearing with ZIMRA and paying duty / VAT."},
    {"key": "clearing",   "label": "Clearing & Inspection", "icon": "🔍",
     "desc": "Clearing agent completed inspection and paperwork."},
    {"key": "transport",  "label": "Road Transport to Zim", "icon": "🚛",
     "desc": "On a truck heading to Harare."},
    {"key": "delivered",  "label": "Delivered",             "icon": "✅",
     "desc": "Your vehicle has arrived. Enjoy your new ride!"},
]

STAGE_INDEX = {s["key"]: i for i, s in enumerate(PIPELINE_STAGES)}


def stage_label(key):
    for s in PIPELINE_STAGES:
        if s["key"] == key:
            return s["label"]
    return key or ""


# ---------------------------------------------------------------------------
# Payment methods supported in Zimbabwe
# ---------------------------------------------------------------------------
PAYMENT_METHODS = {
    "ecocash": {
        "label": "EcoCash",
        "hint": "Send to True Auto Zim on +263 77 123 4567, then enter your EcoCash transaction ID.",
    },
    "innbucks": {
        "label": "InnBucks",
        "hint": "Send to our InnBucks wallet, then enter your InnBucks reference.",
    },
    "onemoney": {
        "label": "OneMoney",
        "hint": "Send to +263 77 123 4567, then enter your OneMoney reference.",
    },
    "bank": {
        "label": "Bank Transfer (USD / RTGS)",
        "hint": "Deposit to True Auto Zim USD account and enter your deposit-slip reference.",
    },
}


def now_utc():
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(160), unique=True, nullable=False, index=True)
    phone = db.Column(db.String(40), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="customer")  # customer | admin
    created_at = db.Column(db.DateTime, default=now_utc)

    orders = db.relationship("Order", backref="customer", lazy="dynamic")

    def set_password(self, pwd):
        self.password_hash = generate_password_hash(pwd)

    def check_password(self, pwd):
        return check_password_hash(self.password_hash, pwd)

    @property
    def is_admin(self):
        return self.role == "admin"


class Vehicle(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(140), unique=True, nullable=False, index=True)
    make = db.Column(db.String(80), nullable=False)
    model = db.Column(db.String(80), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    mileage_km = db.Column(db.Integer, nullable=False)
    transmission = db.Column(db.String(20), default="Automatic")
    fuel = db.Column(db.String(20), default="Petrol")
    engine_cc = db.Column(db.Integer, nullable=True)
    auction_grade = db.Column(db.String(10), nullable=True)
    auction_location = db.Column(db.String(120), nullable=True)
    fob_price_usd = db.Column(db.Float, nullable=False)
    freight_usd = db.Column(db.Float, default=0)
    status = db.Column(db.String(20), default="available")  # available | reserved | sold
    featured = db.Column(db.Boolean, default=False)
    description = db.Column(db.Text, nullable=True)
    auction_sheet = db.Column(db.String(300), nullable=True)
    photos = db.Column(db.Text, default="[]")  # JSON list of filenames / URLs
    created_at = db.Column(db.DateTime, default=now_utc)

    def photo_list(self):
        try:
            return json.loads(self.photos or "[]")
        except Exception:
            return []

    @property
    def title(self):
        return f"{self.make} {self.model}"

    @property
    def full_title(self):
        return f"{self.year} {self.make} {self.model}"


class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_number = db.Column(db.String(40), unique=True, nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    vehicle_id = db.Column(db.Integer, db.ForeignKey("vehicle.id"), nullable=False)
    status = db.Column(db.String(40), nullable=False, default="quote")
    deposit_amount_usd = db.Column(db.Float, default=0)
    commission_usd = db.Column(db.Float, default=0)
    total_estimate_usd = db.Column(db.Float, default=0)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=now_utc)
    updated_at = db.Column(db.DateTime, default=now_utc, onupdate=now_utc)

    vehicle = db.relationship("Vehicle", backref="orders")
    events = db.relationship("TrackingEvent", backref="order", lazy="dynamic")
    payments = db.relationship("Payment", backref="order", lazy="dynamic",
                               order_by="Payment.created_at.asc()")

    def stage_index(self):
        return STAGE_INDEX.get(self.status, 0)

    def latest_event(self):
        return self.events.order_by(TrackingEvent.created_at.desc()).first()

    def paid_total(self):
        return round(sum(p.amount_usd for p in self.payments if p.status == "verified"), 2)

    def outstanding_total(self):
        return round(max(self.total_estimate_usd - self.paid_total(), 0), 2)


class TrackingEvent(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("order.id"), nullable=False)
    stage = db.Column(db.String(40), nullable=False)
    note = db.Column(db.Text, nullable=True)
    evidence_url = db.Column(db.String(300), nullable=True)
    created_at = db.Column(db.DateTime, default=now_utc)


class Payment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("order.id"), nullable=False)
    method = db.Column(db.String(20), nullable=False)
    amount_usd = db.Column(db.Float, nullable=False)
    reference = db.Column(db.String(120), nullable=False)
    status = db.Column(db.String(20), default="pending")  # pending | verified
    note = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=now_utc)
    verified_at = db.Column(db.DateTime, nullable=True)


class Notification(db.Model):
    """In-app notifications (also the source for SMS/WhatsApp pushes)."""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    order_id = db.Column(db.Integer, db.ForeignKey("order.id"), nullable=True)
    kind = db.Column(db.String(40), default="order")  # order | system
    title = db.Column(db.String(200), nullable=False)
    body = db.Column(db.Text, nullable=True)
    read = db.Column(db.Boolean, default=False, index=True)
    created_at = db.Column(db.DateTime, default=now_utc)

    user = db.relationship("User", backref="notifications")


class SavedVehicle(db.Model):
    """Wishlist — saved vehicles per user (BeForward-style 'My List')."""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    vehicle_id = db.Column(db.Integer, db.ForeignKey("vehicle.id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=now_utc)

    __table_args__ = (
        db.UniqueConstraint("user_id", "vehicle_id", name="uq_saved_user_vehicle"),
    )

    user = db.relationship("User", backref="saved_vehicles")
    vehicle = db.relationship("Vehicle", backref="saved_by")

    @property
    def slug(self):
        return self.vehicle.slug


class Inquiry(db.Model):
    """Per-vehicle enquiries (BeForward-style enquiry form)."""
    id = db.Column(db.Integer, primary_key=True)
    vehicle_id = db.Column(db.Integer, db.ForeignKey("vehicle.id"), nullable=True)
    name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(40), nullable=False)
    email = db.Column(db.String(160), nullable=True)
    message = db.Column(db.Text, nullable=True)
    source = db.Column(db.String(40), default="website")  # website | whatsapp | app
    status = db.Column(db.String(20), default="new")  # new | replied | closed
    created_at = db.Column(db.DateTime, default=now_utc)

    vehicle = db.relationship("Vehicle", backref="inquiries")


class CarRequest(db.Model):
    """Source-on-demand — a customer asks us to find a specific car.

    This is the feature that beats BeForward: if it's not in our catalog,
    we source it from Japanese auctions to order. Fully transparent.
    """
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(40), nullable=False)
    email = db.Column(db.String(160), nullable=True)
    make = db.Column(db.String(80), nullable=True)
    model = db.Column(db.String(80), nullable=True)
    year_min = db.Column(db.Integer, nullable=True)
    year_max = db.Column(db.Integer, nullable=True)
    budget_max_usd = db.Column(db.Float, nullable=True)
    fuel = db.Column(db.String(20), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), default="new")  # new | sourcing | sourced | closed
    created_at = db.Column(db.DateTime, default=now_utc)

    def title(self):
        parts = [self.make, self.model]
        if self.year_min or self.year_max:
            parts.append(f"{self.year_min or '?'}–{self.year_max or '?'}")
        return " ".join(p for p in parts if p) or "Unspecified vehicle"


class Review(db.Model):
    """Customer reviews on delivered orders — the public trust story."""
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("order.id"), nullable=False, unique=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    vehicle_id = db.Column(db.Integer, db.ForeignKey("vehicle.id"), nullable=False)
    rating = db.Column(db.Integer, nullable=False)  # 1-5
    comment = db.Column(db.Text, nullable=True)
    approved = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=now_utc)

    order = db.relationship("Order", backref="review")
    user = db.relationship("User", backref="reviews")
    vehicle = db.relationship("Vehicle", backref="reviews")


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

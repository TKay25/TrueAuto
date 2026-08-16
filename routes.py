"""True Auto Zim — server-rendered pages (SEO-friendly) + forms.

Dynamic parts (catalog filtering, tracking updates, payments, chat) are handled
by the JSON API + JS for that "React app" feel, while these pages keep the site
fast, indexable and shareable.
"""
import re

from flask import (
    Blueprint, render_template, request, redirect, url_for, flash, abort,
)
from flask_login import login_required, current_user, login_user, logout_user

from extensions import db
from config import Config
from models import (
    User, Vehicle, Order, TrackingEvent, Payment, stage_label,
    PIPELINE_STAGES, PAYMENT_METHODS, STAGE_INDEX, now_utc,
)
from pricing import estimate_for_vehicle

pages = Blueprint("routes", __name__)


def require_admin():
    if not current_user.is_authenticated or not current_user.is_admin:
        abort(403)


def _slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _unique_slug(base):
    slug = _slugify(base)
    candidate, i = slug, 1
    while Vehicle.query.filter_by(slug=candidate).first():
        candidate = f"{slug}-{i}"
        i += 1
    return candidate


# ---------------------------------------------------------------------------
# Public pages
# ---------------------------------------------------------------------------
@pages.get("/")
def index():
    featured = (Vehicle.query
                .filter_by(status="available")
                .filter_by(featured=True)
                .order_by(Vehicle.created_at.desc())
                .limit(6).all())
    return render_template("index.html", featured=featured)


@pages.get("/catalog")
def catalog():
    makes = [m[0] for m in
             db.session.query(Vehicle.make).distinct().order_by(Vehicle.make).all()]
    selected_make = (request.args.get("make") or "").strip()
    return render_template("catalog.html", makes=makes, selected_make=selected_make)


@pages.get("/brands")
def brands():
    """Browse by make — BeForward-style brand navigation."""
    rows = (db.session.query(
                Vehicle.make,
                db.func.count(Vehicle.id),
                db.func.count(db.func.distinct(Vehicle.model)))
            .group_by(Vehicle.make)
            .order_by(Vehicle.make)
            .all())
    makes = [{"name": m, "count": c, "models": mc} for m, c, mc in rows]
    return render_template("brands.html", makes=makes)


@pages.get("/compare")
def compare():
    """Side-by-side comparison of saved vehicles (compare tray)."""
    return render_template("compare.html")


@pages.get("/request-a-car")
def request_a_car():
    """Source-on-demand — get any car imported even if it's not in the catalog."""
    return render_template("request_a_car.html")


@pages.get("/grades")
def grades():
    """Japanese auction grades explained — transparency & education."""
    return render_template("grades.html")


@pages.get("/catalog/<slug>")
def vehicle_detail(slug):
    from pricing import compute_landed_cost, as_dict
    v = Vehicle.query.filter_by(slug=slug).first_or_404()
    cost = estimate_for_vehicle(v)
    ports = {
        "beira": compute_landed_cost(v.fob_price_usd, port="beira"),
        "durban": compute_landed_cost(v.fob_price_usd, port="durban"),
    }
    ports_json = {k: as_dict(c) for k, c in ports.items()}
    similar = (Vehicle.query
               .filter(Vehicle.make == v.make, Vehicle.slug != v.slug)
               .filter_by(status="available")
               .limit(3).all())
    if not similar:
        similar = (Vehicle.query
                   .filter(Vehicle.slug != v.slug)
                   .filter_by(status="available")
                   .limit(3).all())
    return render_template("vehicle_detail.html", v=v, cost=cost, similar=similar,
                           ports=ports, ports_json=ports_json,
                           port_options=Config.PORT_OPTIONS)


@pages.get("/how-it-works")
def how_it_works():
    return render_template("how_it_works.html", stages=PIPELINE_STAGES)


@pages.get("/pricing")
def pricing():
    return render_template("pricing.html")


@pages.get("/about")
def about():
    return render_template("about.html")


@pages.get("/contact")
def contact():
    return render_template("contact.html")


@pages.get("/track")
def track():
    order_number = (request.args.get("order") or "").strip()
    order = None
    if order_number:
        order = Order.query.filter_by(order_number=order_number.upper()).first()
    return render_template("track.html", order=order, order_number=order_number)


@pages.get("/app")
def app():
    """Client portal — single-page app shell, zero page redirects after load.

    Every view (login, dashboard, tracking, payments, saved cars, catalog)
    is swapped client-side by static/js/app.js via the JSON API.
    """
    return render_template("app.html", portal="client")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@pages.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("routes.dashboard"))

    if request.method == "POST":
        email = (request.form.get("email") or "").strip().lower()
        pwd = request.form.get("password") or ""
        user = User.query.filter_by(email=email).first()
        if user and user.check_password(pwd):
            login_user(user)
            flash(f"Welcome back, {user.name}! 👋", "success")
            nxt = request.args.get("next")
            if nxt and nxt.startswith("/"):
                return redirect(nxt)
            return redirect(url_for("routes.dashboard"))
        flash("Invalid email or password.", "danger")

    return render_template("login.html")


@pages.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for("routes.dashboard"))

    if request.method == "POST":
        name = (request.form.get("name") or "").strip()
        email = (request.form.get("email") or "").strip().lower()
        phone = (request.form.get("phone") or "").strip()
        pwd = request.form.get("password") or ""
        confirm = request.form.get("confirm") or ""

        if not name or not email or not phone or not pwd:
            flash("Please fill in all fields.", "danger")
        elif pwd != confirm:
            flash("Passwords do not match.", "danger")
        elif len(pwd) < 6:
            flash("Password must be at least 6 characters.", "danger")
        elif User.query.filter_by(email=email).first():
            flash("An account with that email already exists.", "danger")
        else:
            user = User(name=name, email=email, phone=phone, role="customer")
            user.set_password(pwd)
            db.session.add(user)
            db.session.commit()
            login_user(user)
            flash("Account created. Welcome to True Auto Zim! 🎉", "success")
            return redirect(url_for("routes.dashboard"))

    return render_template("register.html")


@pages.get("/logout")
@login_required
def logout():
    logout_user()
    flash("You have been logged out.", "info")
    return redirect(url_for("routes.index"))


# ---------------------------------------------------------------------------
# Customer area
# ---------------------------------------------------------------------------
@pages.get("/dashboard")
@login_required
def dashboard():
    orders = (Order.query
              .filter_by(user_id=current_user.id)
              .order_by(Order.created_at.desc()).all())
    return render_template("dashboard.html", orders=orders)


@pages.get("/dashboard/orders/<int:order_id>")
@login_required
def order_detail(order_id):
    order = Order.query.filter_by(id=order_id, user_id=current_user.id).first_or_404()
    cost = estimate_for_vehicle(order.vehicle)
    return render_template("order_tracking.html", order=order, cost=cost,
                           payment_methods=PAYMENT_METHODS)


@pages.route("/checkout/<slug>", methods=["GET", "POST"])
@login_required
def checkout(slug):
    v = Vehicle.query.filter_by(slug=slug).first_or_404()
    cost = estimate_for_vehicle(v)

    if request.method == "POST":
        try:
            deposit = float(request.form.get("deposit") or 0)
        except ValueError:
            deposit = 0
        notes = (request.form.get("notes") or "").strip()

        if deposit <= 0:
            deposit = round(v.fob_price_usd * 0.2, 2)  # default 20% deposit

        order = Order(
            order_number=f"TA-{now_utc().year}-{Order.query.count() + 1:04d}",
            user_id=current_user.id,
            vehicle_id=v.id,
            status="quote",
            deposit_amount_usd=deposit,
            commission_usd=cost.commission,
            total_estimate_usd=cost.total,
            notes=notes,
        )
        db.session.add(order)
        db.session.flush()
        db.session.add(TrackingEvent(
            order_id=order.id,
            stage="quote",
            note="Quote requested via the website. We'll confirm your order shortly.",
        ))
        v.status = "reserved"
        db.session.commit()
        flash(f"Order {order.order_number} created! Track it live on your dashboard.",
              "success")
        return redirect(url_for("routes.order_detail", order_id=order.id))

    return render_template("checkout.html", v=v, cost=cost)


@pages.get("/invoice/<int:order_id>")
@login_required
def invoice(order_id):
    order = Order.query.filter_by(id=order_id, user_id=current_user.id).first_or_404()
    cost = estimate_for_vehicle(order.vehicle)
    return render_template("invoice.html", order=order, cost=cost)


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------
@pages.get("/admin")
def admin_portal():
    """Admin portal — discreet entry point for staff only.

    A customer who is logged in is redirected back to the client portal;
    the portal SPA handles the staff login itself.
    """
    if current_user.is_authenticated and not current_user.is_admin:
        flash("That area is for authorized staff only.", "warning")
        return redirect(url_for("routes.app"))
    return render_template("app.html", portal="admin")


@pages.get("/admin/vehicles")
@login_required
def admin_vehicles():
    require_admin()
    vehicles = Vehicle.query.order_by(Vehicle.created_at.desc()).all()
    return render_template("admin/vehicles.html", vehicles=vehicles)


@pages.route("/admin/vehicles/new", methods=["GET", "POST"])
@login_required
def admin_vehicle_new():
    require_admin()
    if request.method == "POST":
        v = _vehicle_from_form()
        db.session.add(v)
        db.session.commit()
        flash(f"Vehicle '{v.full_title}' added to catalog.", "success")
        return redirect(url_for("routes.admin_vehicles"))
    return render_template("admin/vehicle_form.html", v=None, stages=PIPELINE_STAGES)


@pages.route("/admin/vehicles/<int:vehicle_id>/edit", methods=["GET", "POST"])
@login_required
def admin_vehicle_edit(vehicle_id):
    require_admin()
    v = Vehicle.query.get_or_404(vehicle_id)
    if request.method == "POST":
        _vehicle_from_form(v)
        db.session.commit()
        flash(f"Vehicle '{v.full_title}' updated.", "success")
        return redirect(url_for("routes.admin_vehicles"))
    return render_template("admin/vehicle_form.html", v=v, stages=PIPELINE_STAGES)


@pages.post("/admin/vehicles/<int:vehicle_id>/delete")
@login_required
def admin_vehicle_delete(vehicle_id):
    require_admin()
    v = Vehicle.query.get_or_404(vehicle_id)
    db.session.delete(v)
    db.session.commit()
    flash(f"Vehicle '{v.full_title}' deleted.", "info")
    return redirect(url_for("routes.admin_vehicles"))


def _vehicle_from_form(v=None):
    """Build or update a Vehicle from form data."""
    if v is None:
        v = Vehicle()
        db.session.add(v)
        v.slug = _unique_slug(
            f"{request.form.get('make','')} {request.form.get('model','')} {request.form.get('year','')}"
        )

    v.make = (request.form.get("make") or "").strip()
    v.model = (request.form.get("model") or "").strip()
    v.year = int(request.form.get("year") or 2015)
    v.mileage_km = int(request.form.get("mileage_km") or 0)
    v.transmission = (request.form.get("transmission") or "Automatic").strip()
    v.fuel = (request.form.get("fuel") or "Petrol").strip()
    try:
        v.engine_cc = int(request.form.get("engine_cc")) if request.form.get("engine_cc") else None
    except ValueError:
        v.engine_cc = None
    v.auction_grade = (request.form.get("auction_grade") or "").strip() or None
    v.auction_location = (request.form.get("auction_location") or "").strip() or None
    v.fob_price_usd = float(request.form.get("fob_price_usd") or 0)
    v.freight_usd = float(request.form.get("freight_usd") or 0)
    v.status = (request.form.get("status") or "available").strip()
    v.featured = bool(request.form.get("featured"))
    v.description = (request.form.get("description") or "").strip() or None
    v.auction_sheet = (request.form.get("auction_sheet") or "").strip() or None

    photos_raw = request.form.get("photos") or ""
    photos = [p.strip() for p in photos_raw.replace("\n", ",").split(",") if p.strip()]
    v.photos = __import__("json").dumps(photos)
    return v


@pages.get("/admin/orders")
@login_required
def admin_orders():
    require_admin()
    orders = Order.query.order_by(Order.created_at.desc()).all()
    return render_template("admin/orders.html", orders=orders, stages=PIPELINE_STAGES)


@pages.get("/admin/orders/<int:order_id>")
@login_required
def admin_order_detail(order_id):
    require_admin()
    order = Order.query.get_or_404(order_id)
    cost = estimate_for_vehicle(order.vehicle)
    return render_template("admin/order_detail.html", order=order, cost=cost,
                           stages=PIPELINE_STAGES, stage_index=STAGE_INDEX,
                           payment_methods=PAYMENT_METHODS)

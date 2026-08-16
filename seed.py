"""Seed the database with starter data.

Run:  python seed.py
- Creates an admin user (admin@trueautozim.co.zw / Admin123!)  → CHANGE the password.
- Creates a demo customer (demo@trueautozim.co.zw / Demo123!)
- Seeds a catalog of popular Japan-import vehicles.
- Creates one sample order with a full tracking timeline + a verified payment,
  so you can immediately see the transparency features in action.
"""
import json
import re
from datetime import datetime, timedelta

from app import app
from extensions import db
from models import (
    User, Vehicle, Order, TrackingEvent, Payment, Notification, SavedVehicle,
    Inquiry, CarRequest, Review, now_utc, PIPELINE_STAGES,
)


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def seed():
    with app.app_context():
        db.drop_all()
        db.create_all()

        # ---- Users -----------------------------------------------------
        admin = User(name="True Auto Admin", email="admin@trueautozim.co.zw",
                     phone="+263 77 123 4567", role="admin")
        admin.set_password("Admin123!")
        db.session.add(admin)

        demo = User(name="Demo Customer", email="demo@trueautozim.co.zw",
                    phone="+263 78 555 0000", role="customer")
        demo.set_password("Demo123!")
        db.session.add(demo)
        db.session.flush()  # populate user ids

        # ---- Vehicles --------------------------------------------------
        vehicles = [
            dict(make="Toyota", model="Vitz", year=2016, mileage_km=43000,
                 transmission="Automatic", fuel="Petrol", engine_cc=1300,
                 auction_grade="4.0", auction_location="USS Tokyo",
                 fob_price_usd=3200, featured=True,
                 description="Popular, economical hatchback. Perfect first car — cheap "
                             "to run, parts everywhere in Zim. Grade 4.0 with very good "
                             "interior. Auction sheet and inspection photos available on request."),
            dict(make="Honda", model="Fit", year=2015, mileage_km=58000,
                 transmission="Automatic", fuel="Petrol", engine_cc=1500,
                 auction_grade="4.0", auction_location="JU Nagoya",
                 fob_price_usd=3300, featured=True,
                 description="The Honda Fit is a Zimbabwean favourite — reliable, spacious "
                             "and economical. This one comes with a clean interior and "
                             "full service history from Japan."),
            dict(make="Mazda", model="Demio", year=2015, mileage_km=62000,
                 transmission="Automatic", fuel="Petrol", engine_cc=1300,
                 auction_grade="3.5", auction_location="USS Tokyo",
                 fob_price_usd=2900, featured=False,
                 description="Budget-friendly city car with excellent fuel economy. "
                             "Grade 3.5 — small cosmetic marks but mechanically very sound."),
            dict(make="Nissan", model="Note", year=2016, mileage_km=51000,
                 transmission="Automatic", fuel="Petrol", engine_cc=1200,
                 auction_grade="4.0", auction_location="JU Chiba",
                 fob_price_usd=3100, featured=False,
                 description="Compact, practical and ultra-efficient. Great commuter "
                             "with plenty of cabin space. Imported direct from Japanese auction."),
            dict(make="Toyota", model="Axio", year=2017, mileage_km=46000,
                 transmission="Automatic", fuel="Petrol", engine_cc=1500,
                 auction_grade="4.0", auction_location="USS Tokyo",
                 fob_price_usd=4300, featured=True,
                 description="The Toyota Axio remains one of the most in-demand cars in "
                             "Zimbabwe. Clean, low mileage, and excellent fuel economy. "
                             "Full auction sheet available."),
            dict(make="Toyota", model="Corolla Fielder", year=2016, mileage_km=68000,
                 transmission="Automatic", fuel="Petrol", engine_cc=1500,
                 auction_grade="3.5", auction_location="JU Nagoya",
                 fob_price_usd=3800, featured=False,
                 description="Wagon practicality with Toyota reliability. Great for "
                             "families and small businesses. Comes with a documented "
                             "service record."),
            dict(make="Nissan", model="X-Trail", year=2016, mileage_km=72000,
                 transmission="Automatic", fuel="Petrol", engine_cc=2000,
                 auction_grade="4.0", auction_location="USS Tokyo",
                 fob_price_usd=6800, featured=True,
                 description="A capable SUV that handles Zimbabwean roads with ease. "
                             "7-seater option, spacious and comfortable. Grade 4.0 — "
                             "excellent condition."),
            dict(make="Subaru", model="Forester", year=2017, mileage_km=64000,
                 transmission="Automatic", fuel="Petrol", engine_cc=2000,
                 auction_grade="4.0", auction_location="JU Chiba",
                 fob_price_usd=7200, featured=True,
                 description="Symmetrical AWD makes the Forester a favourite for those "
                             "who travel upcountry. Strong engine, clean body, and "
                             "verified auction grade."),
            dict(make="Toyota", model="Harrier", year=2017, mileage_km=55000,
                 transmission="Automatic", fuel="Petrol", engine_cc=2500,
                 auction_grade="4.5", auction_location="USS Tokyo",
                 fob_price_usd=11500, featured=True,
                 description="Premium mid-size SUV. Grade 4.5 — near-showroom condition "
                             "with a spotless interior. The ultimate comfort choice for "
                             "Harare roads."),
            dict(make="Toyota", model="Land Cruiser Prado", year=2015, mileage_km=92000,
                 transmission="Automatic", fuel="Diesel", engine_cc=3000,
                 auction_grade="4.0", auction_location="USS Tokyo",
                 fob_price_usd=22500, featured=True,
                 description="The legend. A diesel Prado from Japan with full auction "
                             "documentation. Built for anything Zimbabwe can throw at it. "
                             "Reserved for serious buyers."),
        ]

        # Stock car photos (generic Unsplash images) so the catalog looks alive
        # immediately. Swap these for the real auction photos any time.
        STOCK_IMAGES = {
            "Toyota": "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=900&q=60",
            "Honda": "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=900&q=60",
            "Mazda": "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=900&q=60",
            "Nissan": "https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=900&q=60",
            "Subaru": "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=900&q=60",
            "default": "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=60",
        }

        created = []
        for v in vehicles:
            primary = STOCK_IMAGES.get(v["make"], STOCK_IMAGES["default"])
            gallery = [primary, STOCK_IMAGES["default"]] if primary != STOCK_IMAGES["default"] else [primary]
            veh = Vehicle(
                slug=slugify(f"{v['make']} {v['model']} {v['year']}"),
                photos=json.dumps(gallery),
                **v,
            )
            db.session.add(veh)
            created.append(veh)
        db.session.flush()  # populate vehicle ids

        # ---- Demo order (Harrier) with full pipeline + evidence ---------
        from pricing import estimate_for_vehicle
        harrier = next(v for v in created if v.model == "Harrier")
        _cost = estimate_for_vehicle(harrier)
        order = Order(
            order_number="TA-2026-0001",
            user_id=demo.id,
            vehicle_id=harrier.id,
            status="shipping",
            deposit_amount_usd=4000,
            commission_usd=_cost.commission,
            total_estimate_usd=_cost.total,
        )
        db.session.add(order)
        db.session.flush()  # populate order id

        stage_times = [
            ("quote", "Quote requested via website chatbot. Vehicle shortlisted."),
            ("auction", "Placed bid at USS Tokyo auction. Grade 4.5 confirmed."),
            ("won", "AUCTION WON! Final price $11,500 FOB. Deposit now due."),
            ("deposit", "Deposit of $4,000 verified via EcoCash. Receipt sent."),
            ("shipping", "Vehicle loaded on vessel 'MOL Maestro' — ETD Kobe, ETA Beira."),
        ]
        base = now_utc() - timedelta(days=20)
        for i, (stage, note) in enumerate(stage_times):
            db.session.add(TrackingEvent(
                order_id=order.id,
                stage=stage,
                note=note,
                created_at=base + timedelta(days=i * 4),
            ))

        db.session.add(Payment(
            order_id=order.id,
            method="ecocash",
            amount_usd=4000,
            reference="EC-TXN-88412345",
            status="verified",
            note="EcoCash deposit received.",
            created_at=base + timedelta(days=12),
            verified_at=base + timedelta(days=12),
        ))

        # A sample in-app notification so the bell has content
        db.session.add(Notification(
            user_id=demo.id,
            order_id=order.id,
            kind="order",
            title="📦 TA-2026-0001 — Shipping from Japan",
            body="Your 2017 Toyota Harrier is on vessel 'MOL Maestro' — ETD Kobe, ETA Beira.",
            read=False,
            created_at=base + timedelta(days=16),
        ))

        # BeForward-style features: a saved car (wishlist) + an enquiry
        db.session.add(SavedVehicle(
            user_id=demo.id,
            vehicle_id=created[0].id,  # Toyota Vitz
            created_at=base + timedelta(days=10),
        ))
        db.session.add(Inquiry(
            vehicle_id=harrier.id,
            name="Tatenda S.",
            phone="+263 78 111 2233",
            email="tatenda@example.com",
            message="Hi! Is the Harrier still available? What would the total landed cost be in Harare?",
            source="website",
            status="new",
            created_at=base + timedelta(days=8),
        ))

        # Source-on-demand request + an approved customer review
        db.session.add(CarRequest(
            name="Rudo M.",
            phone="+263 77 999 1122",
            email="rudo@example.com",
            make="Toyota",
            model="Land Cruiser Prado",
            year_min=2016,
            year_max=2018,
            budget_max_usd=28000,
            fuel="Diesel",
            notes="Diesel, 7 seater, up to 100k km. Prefer silver or black.",
            status="sourcing",
            created_at=base + timedelta(days=5),
        ))
        db.session.add(Review(
            order_id=order.id,
            user_id=demo.id,
            vehicle_id=harrier.id,
            rating=5,
            comment="Watched my Harrier go from a Tokyo auction to my driveway in Harare. Every receipt shown, every stage tracked — this is how car buying should work in Zimbabwe.",
            approved=True,
            created_at=base + timedelta(days=17),
        ))

        db.session.commit()

        print("✅ Database seeded!")
        print(f"   Admin : admin@trueautozim.co.zw  / Admin123!  (CHANGE THIS)")
        print(f"   Demo  : demo@trueautozim.co.zw   / Demo123!")
        print(f"   Vehicles: {len(created)}")
        print(f"   Demo order TA-2026-0001 (Harrier) with live tracking timeline.")


if __name__ == "__main__":
    seed()

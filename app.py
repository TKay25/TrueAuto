"""True Auto Zim — Flask application entry point.

Run with:  python app.py   (or:  flask --app app run)
"""
from flask import Flask

from config import Config
from extensions import db, login_manager
from pricing import estimate_for_vehicle


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = "routes.login"
    login_manager.login_message = "Please log in to continue."
    login_manager.login_message_category = "info"

    # Register models (schema is created by seed.py / create_all is tolerant)
    from models import User, Vehicle, Order, TrackingEvent, Payment, Notification, SavedVehicle, Inquiry, CarRequest, Review  # noqa: F401
    with app.app_context():
        try:
            db.create_all()
        except Exception:
            # Tables may already exist (e.g. after seed.py on PostgreSQL)
            db.session.rollback()

    # Number formatting filters — always ###,###,###.##
    @app.template_filter("money")
    def money_filter(value):
        try:
            return f"{float(value):,.2f}"
        except (TypeError, ValueError):
            return "0.00"

    @app.template_filter("num")
    def num_filter(value, decimals=2):
        try:
            return f"{float(value):,.{int(decimals)}f}"
        except (TypeError, ValueError):
            return "0"

    # Blueprints
    from routes import pages
    from api import api
    app.register_blueprint(pages)
    app.register_blueprint(api)

    # Values available in every template
    @app.context_processor
    def inject_globals():
        return {
            "COMPANY": Config.COMPANY_NAME,
            "CONTACT": Config.CONTACT_PHONE,
            "CONTACT_EMAIL": Config.CONTACT_EMAIL,
            "ADDRESS": Config.ADDRESS,
            "SUPPORT_HOURS": Config.SUPPORT_HOURS,
            "COMMISSION": Config.COMMISSION_FLAT,
            "JPY_PER_USD": Config.JPY_PER_USD,
            "PORT_OPTIONS": Config.PORT_OPTIONS,
            "DEFAULT_PORT": Config.DEFAULT_PORT,
            "estimate_for_vehicle": estimate_for_vehicle,
            "COST_MODEL": {
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
                "ports": Config.PORT_OPTIONS,
                "default_port": Config.DEFAULT_PORT,
            },
        }

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5001)

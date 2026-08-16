"""True Auto Zim — application configuration.

All business-critical numbers live here so you can tune them in one place
(or via the .env file) without touching code.
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me-in-production")
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "sqlite:///trueauto.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Keep connections alive across Render's Postgres idle-timeout
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
    }

    # ------------------------------------------------------------------
    # Indicative import & duty model (USD).
    # NOTE: These are CONFIGURABLE DEFAULTS so you can start quoting fast.
    # ALWAYS verify the current ZIMRA used-vehicle formula with ZIMRA or
    # your clearing agent before locking a client quote.
    # ------------------------------------------------------------------
    DUTY_RATE = float(os.environ.get("DUTY_RATE", 0.25))             # customs duty (% of CIF)
    SURTAX_RATE = float(os.environ.get("SURTAX_RATE", 0.10))         # surtax on used vehicles
    VAT_RATE = float(os.environ.get("VAT_RATE", 0.15))               # VAT on (CIF + duty + surtax)
    INSURANCE_RATE = float(os.environ.get("INSURANCE_RATE", 0.03))   # marine insurance (% of CIF)
    AUCTION_FEES = float(os.environ.get("AUCTION_FEES", 300))        # auction + export docs (USD)
    FREIGHT_USD = float(os.environ.get("FREIGHT_USD", 1400))         # freight Japan -> Beira/Durban
    PORT_HANDLING = float(os.environ.get("PORT_HANDLING", 250))      # port handling / demurrage
    CLEARING_FEE = float(os.environ.get("CLEARING_FEE", 350))        # clearing agent fee
    INSPECTION_FEE = float(os.environ.get("INSPECTION_FEE", 50))     # VID / police inspection
    TRANSPORT_TO_HRE = float(os.environ.get("TRANSPORT_TO_HRE", 700))  # port -> Harare trucking
    COMMISSION_FLAT = float(os.environ.get("COMMISSION_FLAT", 850))  # fixed auction & shipping assistance fee (USD)

    # --- Chatbot -----------------------------------------------------
    OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
    OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

    # --- Currency display ---------------------------------------------
    JPY_PER_USD = float(os.environ.get("JPY_PER_USD", 148))  # ~JPY per 1 USD (display only)

    # --- Port routes (Zimbabwe-specific choice) -------------------------
    # Cars from Japan enter Zim mainly via Beira (Mozambique) or Durban (SA).
    # Letting the customer pick the route is a BeForward-beating feature.
    DEFAULT_PORT = os.environ.get("DEFAULT_PORT", "beira")
    PORT_OPTIONS = {
        "beira": {
            "label": "Beira (Mozambique)",
            "freight": 1400,
            "transport": 700,
            "eta": "4–6 weeks shipping",
        },
        "durban": {
            "label": "Durban (South Africa)",
            "freight": 1700,
            "transport": 1300,
            "eta": "5–8 weeks shipping",
        },
    }

    # --- WhatsApp Business Cloud API ---------------------------------
    WHATSAPP_TOKEN = os.environ.get("WHATSAPP_TOKEN", "")
    WHATSAPP_PHONE_ID = os.environ.get("WHATSAPP_PHONE_ID", "")
    WHATSAPP_VERIFY_TOKEN = os.environ.get("WHATSAPP_VERIFY_TOKEN", "")

    # --- SMS gateway (Africa's Talking — popular in Zimbabwe) ---------
    AT_USERNAME = os.environ.get("AT_USERNAME", "")
    AT_API_KEY = os.environ.get("AT_API_KEY", "")

    # --- Business ------------------------------------------------------
    COMPANY_NAME = "True Auto Zim"
    CONTACT_PHONE = os.environ.get("CONTACT_PHONE", "+263 77 123 4567")
    CONTACT_EMAIL = os.environ.get("CONTACT_EMAIL", "sales@trueautozim.co.zw")
    SUPPORT_HOURS = "Mon–Sat, 08:00–17:00 CAT"
    ADDRESS = "Harare, Zimbabwe"

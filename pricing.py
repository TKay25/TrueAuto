"""Landed-cost engine — the heart of our transparency promise.

Every vehicle gets a full, itemised breakdown of what it actually costs to
land in Zimbabwe. No hidden mark-ups: customers see every line, and we earn
one clearly-stated fixed auction & shipping assistance fee (for helping bid,
buy and ship from the Japanese auction) — every other cost is passed through
at cost, and clearing to Harare is optional.
"""
from dataclasses import dataclass, asdict

from config import Config


@dataclass
class LandedCost:
    fob: float
    freight: float
    auction_fees: float
    insurance: float
    cif: float
    duty: float
    surtax: float
    vat: float
    port_handling: float
    clearing: float
    inspection: float
    transport: float
    commission: float
    total: float
    port_total: float


def compute_landed_cost(fob, freight=None, auction_fees=None, commission=None,
                        port=None, deliver_to_harare=True):
    """Itemised landed cost for a Japan → Zimbabwe import, in USD.

    `port` picks the shipping route (Beira or Durban) and adjusts freight and
    road transport accordingly — a Zimbabwe-specific option.
    `deliver_to_harare=False` drops clearing, inspection and road transport
    (clearing is optional — some buyers clear the car themselves at the port);
    `port_total` then shows the landed-at-port price.
    """
    port_cfg = Config.PORT_OPTIONS.get(port) if port else None
    freight = freight if freight is not None else (port_cfg["freight"] if port_cfg else Config.FREIGHT_USD)
    transport = (port_cfg["transport"] if port_cfg else Config.TRANSPORT_TO_HRE) if deliver_to_harare else 0.0
    auction_fees = auction_fees if auction_fees is not None else Config.AUCTION_FEES
    commission = commission if commission is not None else Config.COMMISSION_FLAT

    cif = fob + freight                                  # Cost + Insurance + Freight
    insurance = cif * Config.INSURANCE_RATE
    duty = cif * Config.DUTY_RATE
    surtax = cif * Config.SURTAX_RATE
    vat = (cif + duty + surtax) * Config.VAT_RATE

    clearing = Config.CLEARING_FEE if deliver_to_harare else 0.0
    inspection = Config.INSPECTION_FEE if deliver_to_harare else 0.0
    delivery = clearing + inspection + transport

    total = (
        cif + insurance + duty + surtax + vat
        + auction_fees
        + Config.PORT_HANDLING
        + clearing + inspection + transport
        + commission
    )

    return LandedCost(
        fob=round(fob, 2),
        freight=round(freight, 2),
        auction_fees=round(auction_fees, 2),
        insurance=round(insurance, 2),
        cif=round(cif, 2),
        duty=round(duty, 2),
        surtax=round(surtax, 2),
        vat=round(vat, 2),
        port_handling=Config.PORT_HANDLING,
        clearing=round(clearing, 2),
        inspection=round(inspection, 2),
        transport=round(transport, 2),
        commission=round(commission, 2),
        total=round(total, 2),
        port_total=round(total - delivery, 2),
    )


def estimate_for_vehicle(vehicle):
    """Quick estimate for a Vehicle row (uses its own freight if set)."""
    freight = vehicle.freight_usd or Config.FREIGHT_USD
    return compute_landed_cost(vehicle.fob_price_usd, freight=freight)


def as_dict(cost: LandedCost) -> dict:
    return asdict(cost)

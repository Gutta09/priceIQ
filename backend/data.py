"""
PriceIQ — Indian Domestic Routes

DATA PROVENANCE (read this before citing numbers):
  REAL data, embedded verbatim:
    - Market-level Passenger Load Factor (PLF): DGCA Scheduled Domestic monthly
      reports via github.com/Vonter/india-aviation-traffic (carrier.csv)
    - City-pair passenger volumes: DGCA city-pair monthly traffic (city.csv)
    - Fare levels: public fare ranges for Indian full-service carriers (2024-25)
  SYNTHETIC data, generated here:
    - The 90-day booking history is simulated from a constant-elasticity demand
      model whose demand LEVEL is anchored to the real DGCA PLF figures above.
      Calibration against it is therefore a simulation study — it demonstrates
      that the log-log OLS pipeline recovers known parameters, NOT that the
      elasticities are estimated from real bookings.

Cabin model: Indian domestic three-class narrowbody (e.g. Air India A320neo,
8 Business / 24 Premium Economy / 132 Economy = 164 seats). No Indian domestic
carrier operates a first-class cabin.
"""

import os
import sqlite3
import numpy as np
from datetime import date, timedelta
from typing import Optional

DB_PATH = os.environ.get("PRICEIQ_DB", "priceiq.db")

# Fare classes, cheapest to most expensive. Keys are used in DB column names
# (base_price_<fc>, capacity_<fc>_frac) and API field names.
FARE_CLASSES = ("economy", "premium", "business")

# ---------------------------------------------------------------------------
# Real DGCA data — embedded directly from carrier.csv ScheduledDomestic totals
# Source: github.com/Vonter/india-aviation-traffic
# ---------------------------------------------------------------------------

# Monthly market-level PLF (%) for Scheduled Domestic — exact DGCA values
DGCA_MARKET_PLF = {
    (2024, 1): 88.3, (2024, 2): 89.0, (2024, 3): 86.0,
    (2024, 4): 86.8, (2024, 5): 88.9, (2024, 6): 87.3,
    (2024, 7): 85.0, (2024, 8): 82.8, (2024, 9): 83.0,
    (2024, 10): 82.4, (2024, 11): 89.4, (2024, 12): 88.9,
    (2025, 1): 88.3, (2025, 2): 90.4, (2025, 3): 83.8,
}

# Monthly city-pair combined passengers (both directions), from DGCA city.csv.
# NOTE: the DGCA city-pair dataset publishes different month windows per route;
# the windows below are the most recent six months available for each pair at
# the time of embedding, hence they intentionally differ route to route.
DGCA_ROUTE_MONTHLY_PAX = {
    "DEL-BOM": {
        (2025, 7): 493_678, (2025, 8): 507_830, (2025, 9): 503_271,
        (2025, 10): 548_294, (2025, 11): 602_310, (2025, 12): 579_890,
    },
    "DEL-BLR": {
        (2025, 11): 444_099, (2025, 12): 421_576, (2026, 1): 415_981,
        (2026, 2): 427_600, (2026, 3): 419_883, (2026, 4): 424_379,
    },
    "BOM-BLR": {
        (2025, 7): 333_375, (2025, 8): 339_811, (2025, 9): 329_010,
        (2025, 10): 318_397, (2025, 11): 340_573, (2025, 12): 321_355,
    },
    "DEL-HYD": {
        (2025, 11): 264_228, (2025, 12): 253_895, (2026, 1): 266_185,
        (2026, 2): 265_783, (2026, 3): 273_395, (2026, 4): 268_312,
    },
    "DEL-CCU": {
        (2025, 11): 252_068, (2025, 12): 252_732, (2026, 1): 268_402,
        (2026, 2): 261_672, (2026, 3): 275_206, (2026, 4): 245_477,
    },
    "DEL-MAA": {
        (2025, 11): 192_136, (2025, 12): 181_389, (2026, 1): 190_317,
        (2026, 2): 193_080, (2026, 3): 198_855, (2026, 4): 171_299,
    },
    "BOM-HYD": {
        (2025, 7): 187_430, (2025, 8): 198_743, (2025, 9): 187_828,
        (2025, 10): 179_741, (2025, 11): 178_562, (2025, 12): 159_157,
    },
    "BOM-MAA": {
        (2025, 7): 172_229, (2025, 8): 171_819, (2025, 9): 165_341,
        (2025, 10): 171_888, (2025, 11): 202_574, (2025, 12): 194_422,
    },
}

# Route-level PLF adjustment relative to market (percentage points).
# Derived from city-pair volume rankings — busier routes fill higher.
DGCA_ROUTE_PLF_DELTA = {
    "DEL-BOM": +3.0,   # busiest domestic route, ~600k pax/mo
    "DEL-BLR": +1.0,   # second busiest, ~440k pax/mo
    "BOM-BLR": +1.0,   # third, ~330k pax/mo
    "DEL-HYD": -0.5,
    "DEL-CCU": -2.0,
    "DEL-MAA": -2.5,
    "BOM-HYD": -2.0,
    "BOM-MAA": -3.5,
}

# ---------------------------------------------------------------------------
# Route seed data — 8 busiest Indian domestic routes (INR fares, km distances)
# Aircraft: three-class A320neo, 164 seats (132 Y / 24 W / 8 J)
#   -> cabin fractions 0.80 / 0.15 / 0.05
# ---------------------------------------------------------------------------

def _route(route_id, origin, destination, distance_km,
           eco_price, prem_price, biz_price):
    return {
        "route_id": route_id,
        "origin": origin,
        "destination": destination,
        "distance_km": distance_km,
        "base_price_economy": eco_price,
        "base_price_premium": prem_price,
        "base_price_business": biz_price,
        "total_capacity": 164,
        "capacity_economy_frac": 0.80,
        "capacity_premium_frac": 0.15,
        "capacity_business_frac": 0.05,
        "price_floor_mult": 0.50,
        "price_ceil_mult": 3.00,
    }


ROUTES_SEED = [
    _route("DEL-BOM", "Delhi (DEL)", "Mumbai (BOM)",     1148, 5500.0,  9500.0, 21000.0),
    _route("DEL-BLR", "Delhi (DEL)", "Bengaluru (BLR)",  1740, 6500.0, 11000.0, 24000.0),
    _route("BOM-BLR", "Mumbai (BOM)", "Bengaluru (BLR)",  844, 4800.0,  8200.0, 17500.0),
    _route("DEL-HYD", "Delhi (DEL)", "Hyderabad (HYD)",  1253, 5200.0,  8800.0, 19000.0),
    _route("DEL-CCU", "Delhi (DEL)", "Kolkata (CCU)",    1306, 5800.0,  9800.0, 21500.0),
    _route("DEL-MAA", "Delhi (DEL)", "Chennai (MAA)",    1753, 6200.0, 10500.0, 23000.0),
    _route("BOM-HYD", "Mumbai (BOM)", "Hyderabad (HYD)",  624, 4200.0,  7200.0, 15500.0),
    _route("BOM-MAA", "Mumbai (BOM)", "Chennai (MAA)",    995, 4500.0,  7800.0, 16500.0),
]

# Demand parameters chosen so that at base_price, demand ≈ cabin capacity × target PLF.
# Economy PLF ≈ DGCA route PLF + 3 pp (economy fills fastest).
# Premium economy PLF ≈ route PLF − 10 pp. Business PLF ≈ route PLF − 20 pp.
# Elasticities: Indian economy travellers are highly price-sensitive (1.6–1.85);
# premium economy moderately so (0.9–1.05); business/corporate nearly inelastic
# (0.45–0.60).
DEMAND_PARAMS_SEED = {
    "DEL-BOM": {
        "economy":  {"base_demand": 117.0, "elasticity": 1.72},
        "premium":  {"base_demand":  18.5, "elasticity": 0.95},
        "business": {"base_demand":   5.4, "elasticity": 0.52},
    },
    "DEL-BLR": {
        "economy":  {"base_demand": 115.0, "elasticity": 1.68},
        "premium":  {"base_demand":  18.0, "elasticity": 0.92},
        "business": {"base_demand":   5.2, "elasticity": 0.50},
    },
    "BOM-BLR": {
        "economy":  {"base_demand": 114.0, "elasticity": 1.75},
        "premium":  {"base_demand":  17.5, "elasticity": 0.94},
        "business": {"base_demand":   5.1, "elasticity": 0.48},
    },
    "DEL-HYD": {
        "economy":  {"base_demand": 113.0, "elasticity": 1.70},
        "premium":  {"base_demand":  17.0, "elasticity": 0.98},
        "business": {"base_demand":   5.2, "elasticity": 0.55},
    },
    "DEL-CCU": {
        "economy":  {"base_demand": 111.0, "elasticity": 1.65},
        "premium":  {"base_demand":  16.8, "elasticity": 1.00},
        "business": {"base_demand":   5.0, "elasticity": 0.58},
    },
    "DEL-MAA": {
        "economy":  {"base_demand": 110.0, "elasticity": 1.80},
        "premium":  {"base_demand":  16.5, "elasticity": 1.05},
        "business": {"base_demand":   4.9, "elasticity": 0.60},
    },
    "BOM-HYD": {
        "economy":  {"base_demand": 105.0, "elasticity": 1.78},
        "premium":  {"base_demand":  15.5, "elasticity": 1.02},
        "business": {"base_demand":   4.9, "elasticity": 0.55},
    },
    "BOM-MAA": {
        "economy":  {"base_demand": 103.0, "elasticity": 1.82},
        "premium":  {"base_demand":  15.2, "elasticity": 1.04},
        "business": {"base_demand":   4.7, "elasticity": 0.58},
    },
}


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_db_connection()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS routes (
                route_id TEXT PRIMARY KEY,
                origin TEXT NOT NULL,
                destination TEXT NOT NULL,
                distance_km INTEGER,
                base_price_economy REAL NOT NULL,
                base_price_premium REAL NOT NULL,
                base_price_business REAL NOT NULL,
                total_capacity INTEGER NOT NULL,
                capacity_economy_frac REAL DEFAULT 0.80,
                capacity_premium_frac REAL DEFAULT 0.15,
                capacity_business_frac REAL DEFAULT 0.05,
                price_floor_mult REAL DEFAULT 0.50,
                price_ceil_mult REAL DEFAULT 3.00
            );

            CREATE TABLE IF NOT EXISTS demand_params (
                route_id TEXT NOT NULL REFERENCES routes(route_id),
                fare_class TEXT NOT NULL,
                base_demand REAL NOT NULL,
                elasticity REAL NOT NULL,
                PRIMARY KEY (route_id, fare_class)
            );

            CREATE TABLE IF NOT EXISTS historical_bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                route_id TEXT NOT NULL REFERENCES routes(route_id),
                fare_class TEXT NOT NULL,
                booking_date TEXT NOT NULL,
                price_charged REAL NOT NULL,
                seats_sold INTEGER NOT NULL,
                load_factor REAL NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_bookings_route_class
                ON historical_bookings (route_id, fare_class, booking_date);
        """)
        conn.commit()
    finally:
        conn.close()


def _route_plf_for_day(route_id: str, booking_date: date) -> float:
    """
    DGCA-calibrated PLF for a given route and date: real DGCA market PLF as the
    monthly baseline, plus the route-specific delta.
    """
    key = (booking_date.year, booking_date.month)
    market_plf = DGCA_MARKET_PLF.get(key, 86.0) / 100.0
    delta = DGCA_ROUTE_PLF_DELTA.get(route_id, 0.0) / 100.0
    return market_plf + delta


def seed_data():
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) as cnt FROM routes")
        if cur.fetchone()["cnt"] > 0:
            return

        rng = np.random.default_rng(42)

        for route in ROUTES_SEED:
            cur.execute("""
                INSERT INTO routes VALUES (
                    :route_id, :origin, :destination, :distance_km,
                    :base_price_economy, :base_price_premium, :base_price_business,
                    :total_capacity,
                    :capacity_economy_frac, :capacity_premium_frac, :capacity_business_frac,
                    :price_floor_mult, :price_ceil_mult
                )
            """, route)

            for fare_class in FARE_CLASSES:
                dp = DEMAND_PARAMS_SEED[route["route_id"]][fare_class]
                cur.execute(
                    "INSERT INTO demand_params VALUES (?, ?, ?, ?)",
                    (route["route_id"], fare_class, dp["base_demand"], dp["elasticity"]),
                )

        # SYNTHETIC booking history: Jan 1 – Mar 31 2025 (90 days).
        # DGCA PLF acts as a MULTIPLICATIVE demand scaler, not an additive blend:
        #
        #   nominal_plf_at_base = base_demand / capacity   (model expectation at base price)
        #   dgca_mult = dgca_plf / nominal_plf_at_base     (real-world vs model baseline)
        #   demand = base_demand × dgca_mult × (price/base)^(-e) × noise
        #
        # This preserves the price-elasticity signal so calibration can recover
        # elasticity, while grounding demand levels in real DGCA occupancy.
        # Because the generator and the calibration model share the same
        # functional form, calibration against this data is a parameter-recovery
        # simulation study (see module docstring) — high R² is expected, not proof.
        start_date = date(2025, 1, 1)
        for route in ROUTES_SEED:
            route_id = route["route_id"]

            for fare_class in FARE_CLASSES:
                dp = DEMAND_PARAMS_SEED[route_id][fare_class]
                base_price = route[f"base_price_{fare_class}"]
                base_demand = dp["base_demand"]
                elasticity = dp["elasticity"]
                cap_frac = route[f"capacity_{fare_class}_frac"]
                capacity_for_class = int(route["total_capacity"] * cap_frac)

                # Nominal PLF the model expects at base price
                nominal_plf = base_demand / capacity_for_class if capacity_for_class > 0 else 0.85

                # Fare class PLF offsets relative to overall route PLF
                fc_plf_offset = {"economy": +0.03, "premium": -0.10, "business": -0.20}[fare_class]

                for day_offset in range(90):
                    booking_date = start_date + timedelta(days=day_offset)

                    route_plf = _route_plf_for_day(route_id, booking_date)
                    target_lf = max(0.30, min(route_plf + fc_plf_offset, 0.99))
                    dgca_mult = target_lf / nominal_plf

                    # Day-of-week pricing: Mon/Fri business peaks, Sat leisure peak
                    dow = booking_date.weekday()
                    dow_mult = 1.12 if dow in (0, 4) else (1.08 if dow == 5 else 0.95)
                    price_mult = rng.uniform(0.62, 1.45) * dow_mult
                    price = base_price * price_mult

                    raw_demand = base_demand * dgca_mult * (price / base_price) ** (-elasticity)
                    # ±4% observational noise, truncated at cabin capacity.
                    # Truncation censors the demand signal on sold-out days —
                    # calibration handles this by discarding censored rows
                    # (the classic RM "unconstraining" problem).
                    seats_sold = max(0, min(round(raw_demand * rng.uniform(0.96, 1.04)), capacity_for_class))
                    load_factor = round(seats_sold / capacity_for_class, 4) if capacity_for_class > 0 else 0.0

                    cur.execute(
                        "INSERT INTO historical_bookings "
                        "(route_id, fare_class, booking_date, price_charged, seats_sold, load_factor) "
                        "VALUES (?, ?, ?, ?, ?, ?)",
                        (route_id, fare_class, booking_date.isoformat(),
                         round(price, 2), seats_sold, load_factor),
                    )

        conn.commit()
    finally:
        conn.close()


def _attach_dgca_meta(route: dict) -> dict:
    route["dgca_route_plf_delta"] = DGCA_ROUTE_PLF_DELTA.get(route["route_id"], 0.0)
    latest_key = max(DGCA_MARKET_PLF.keys())
    route["dgca_latest_market_plf"] = DGCA_MARKET_PLF[latest_key]
    route["dgca_latest_month"] = f"{latest_key[0]}-{latest_key[1]:02d}"
    return route


def get_all_routes() -> list:
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM routes ORDER BY route_id")
        routes = [dict(r) for r in cur.fetchall()]

        # Single query for all demand params (avoids one query per route)
        cur.execute("SELECT route_id, fare_class, base_demand, elasticity FROM demand_params")
        params_by_route: dict = {}
        for row in cur.fetchall():
            params_by_route.setdefault(row["route_id"], {})[row["fare_class"]] = {
                "base_demand": row["base_demand"], "elasticity": row["elasticity"],
            }
    finally:
        conn.close()

    for route in routes:
        route["demand_params"] = params_by_route.get(route["route_id"], {})
        _attach_dgca_meta(route)
    return routes


def get_route(route_id: str) -> Optional[dict]:
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM routes WHERE route_id = ?", (route_id,))
        row = cur.fetchone()
        if row is None:
            return None
        route = dict(row)
        cur.execute(
            "SELECT fare_class, base_demand, elasticity FROM demand_params WHERE route_id = ?",
            (route_id,),
        )
        route["demand_params"] = {
            r["fare_class"]: {"base_demand": r["base_demand"], "elasticity": r["elasticity"]}
            for r in cur.fetchall()
        }
    finally:
        conn.close()
    return _attach_dgca_meta(route)


def get_historical_bookings(route_id: str, days: int = 90) -> list[dict]:
    """Most recent bookings for a route, all fare classes, newest first."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT fare_class, price_charged, seats_sold, load_factor FROM historical_bookings "
            "WHERE route_id = ? ORDER BY booking_date DESC LIMIT ?",
            (route_id, days * len(FARE_CLASSES)),
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_dgca_summary() -> dict:
    """Returns the embedded DGCA metadata for API/UI display."""
    return {
        "source": "DGCA Scheduled Domestic Monthly Reports via github.com/Vonter/india-aviation-traffic",
        "market_plf_series": [
            {"year": k[0], "month": k[1], "plf_pct": v}
            for k, v in sorted(DGCA_MARKET_PLF.items())
        ],
        "route_plf_deltas": DGCA_ROUTE_PLF_DELTA,
        "route_monthly_pax": {
            route_id: [
                {"year": k[0], "month": k[1], "pax": v}
                for k, v in sorted(pax_dict.items())
            ]
            for route_id, pax_dict in DGCA_ROUTE_MONTHLY_PAX.items()
        },
    }


if __name__ == "__main__":
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    init_db()
    seed_data()
    routes = get_all_routes()
    print(f"Seeded {len(routes)} Indian routes")
    for r in routes:
        dp = r["demand_params"]
        print(f"  {r['route_id']}: ₹{r['base_price_economy']:,.0f} eco | "
              f"cap={r['total_capacity']} | "
              f"eco base_demand={dp['economy']['base_demand']}")

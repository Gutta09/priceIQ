import logging
import os
import sys
from contextlib import asynccontextmanager
from typing import Annotated, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

sys.path.insert(0, os.path.dirname(__file__))

from data import (
    init_db, seed_data, get_all_routes, get_route, get_dgca_summary,
    DGCA_ROUTE_MONTHLY_PAX,
)
from optimizer import solve_pricing_mip, build_fare_class_params, generate_scenarios
from calibration import run_full_calibration

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("priceiq")

# Seat-capacity override bounds shared by /optimize and /scenarios.
# Upper bound keeps a public, unauthenticated endpoint from feeding the CBC
# solver arbitrarily large instances.
CAPACITY_BOUNDS = {"ge": 50, "le": 500}


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed_data()
    logger.info("Database initialised and seeded")
    yield


app = FastAPI(
    title="PriceIQ API",
    version="1.1.0",
    description="Indian domestic airline dynamic pricing optimisation · OR-Tools CBC · DGCA-grounded simulation",
    lifespan=lifespan,
)

# Allow Vite dev server + any deployed origin
_ALLOWED_ORIGINS = [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:5174", "http://localhost:5175", "http://localhost:5176",
]
_ALLOW_ALL = os.environ.get("CORS_ALL", "false").lower() == "true"
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _ALLOW_ALL else _ALLOWED_ORIGINS,
    allow_credentials=not _ALLOW_ALL,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ────────────────────────────────────────────────

class OptimizeRequest(BaseModel):
    route_id: str
    total_capacity: Optional[int] = Field(default=None, **CAPACITY_BOUNDS)
    demand_multiplier: float = Field(default=1.0, ge=0.1, le=5.0)
    economy_elasticity: Optional[float] = Field(default=None, ge=0.1, le=5.0)
    premium_elasticity: Optional[float] = Field(default=None, ge=0.1, le=5.0)
    business_elasticity: Optional[float] = Field(default=None, ge=0.1, le=5.0)
    n_candidates: int = Field(default=50, ge=10, le=200)


class FareClassResultOut(BaseModel):
    fare_class: str
    optimal_price: float
    expected_demand: float
    expected_revenue: float


class OptimizeResponse(BaseModel):
    route_id: str
    status: str
    message: str = ""
    fare_classes: List[FareClassResultOut]
    total_revenue: float
    total_expected_seats: float
    solver_time_ms: float


class ScenarioRow(BaseModel):
    scenario: str
    label: str
    demand_multiplier: float
    status: str
    economy_price: float
    premium_price: float
    business_price: float
    economy_demand: float
    premium_demand: float
    business_demand: float
    total_revenue: float
    total_expected_seats: float
    load_factor: float


# ── Endpoints ────────────────────────────────────────────────────────────────
# Compute endpoints are deliberately sync (`def`, not `async def`): FastAPI runs
# them in a threadpool, so a 10-second CBC solve cannot block the event loop.

@app.get("/routes")
def list_routes():
    return get_all_routes()


@app.post("/optimize", response_model=OptimizeResponse)
def optimize_pricing(req: OptimizeRequest):
    route = get_route(req.route_id)
    if route is None:
        raise HTTPException(status_code=404, detail=f"Route '{req.route_id}' not found")

    total_capacity = req.total_capacity if req.total_capacity is not None else route["total_capacity"]

    overrides = {}
    for fc in ("economy", "premium", "business"):
        value = getattr(req, f"{fc}_elasticity")
        if value is not None:
            overrides[f"{fc}_elasticity"] = value

    route_with_cap = {**route, "total_capacity": total_capacity}
    fare_classes = build_fare_class_params(route_with_cap, overrides)

    result = solve_pricing_mip(
        fare_classes=fare_classes,
        total_capacity=total_capacity,
        demand_multiplier=req.demand_multiplier,
        n_candidates=req.n_candidates,
    )
    logger.info(
        "optimize route=%s cap=%d mult=%.2f status=%s revenue=%.0f in %.1fms",
        req.route_id, total_capacity, req.demand_multiplier,
        result.status, result.total_revenue, result.solver_time_ms,
    )

    return OptimizeResponse(
        route_id=req.route_id,
        status=result.status,
        message=result.message,
        fare_classes=[
            FareClassResultOut(
                fare_class=fc.fare_class,
                optimal_price=fc.optimal_price,
                expected_demand=fc.expected_demand,
                expected_revenue=fc.expected_revenue,
            )
            for fc in result.fare_classes
        ],
        total_revenue=result.total_revenue,
        total_expected_seats=result.total_expected_seats,
        solver_time_ms=result.solver_time_ms,
    )


@app.get("/scenarios")
def get_scenarios(
    route_id: Annotated[str, Query(description="Route ID e.g. DEL-BOM")],
    total_capacity: Annotated[
        Optional[int],
        Query(description="Override seat capacity", **CAPACITY_BOUNDS),
    ] = None,
):
    route = get_route(route_id)
    if route is None:
        raise HTTPException(status_code=404, detail=f"Route '{route_id}' not found")

    cap = total_capacity if total_capacity is not None else route["total_capacity"]
    route_with_cap = {**route, "total_capacity": cap}
    raw_scenarios = generate_scenarios(route_with_cap, cap)

    return [
        ScenarioRow(
            scenario=s["scenario"],
            label=s["label"],
            demand_multiplier=s["demand_multiplier"],
            status=s.get("status", "OPTIMAL"),
            economy_price=s.get("economy_price", 0.0),
            premium_price=s.get("premium_price", 0.0),
            business_price=s.get("business_price", 0.0),
            economy_demand=s.get("economy_demand", 0.0),
            premium_demand=s.get("premium_demand", 0.0),
            business_demand=s.get("business_demand", 0.0),
            total_revenue=s.get("total_revenue", 0.0),
            total_expected_seats=s.get("total_expected_seats", 0.0),
            load_factor=s.get("load_factor", 0.0),
        )
        for s in raw_scenarios
    ]


@app.post("/calibrate")
def calibrate(route_id: Optional[str] = Query(default=None)):
    logger.info("calibrate route=%s", route_id or "ALL")
    return run_full_calibration(route_id)


@app.get("/dgca")
def dgca_data():
    return get_dgca_summary()


@app.get("/metrics/{route_id}")
def route_metrics(route_id: str):
    """
    Real airline revenue-management KPIs for a route.
    RASK  = Revenue per Available Seat Kilometre
    PRASK = Passenger Revenue per ASK (same as RASK for pax-only flights)
    Yield = Revenue per Revenue Passenger Kilometre (RPK)
    """
    route = get_route(route_id)
    if route is None:
        raise HTTPException(status_code=404, detail=f"Route '{route_id}' not found")

    dist_km = route["distance_km"]
    cap = route["total_capacity"]

    # Baseline optimization for optimal revenue/demand figures (cached solve)
    fare_classes = build_fare_class_params(route)
    result = solve_pricing_mip(fare_classes, cap, demand_multiplier=1.0)

    total_ask = cap * dist_km                            # Available Seat Km
    total_rpk = result.total_expected_seats * dist_km    # Revenue Passenger Km

    rask = result.total_revenue / total_ask if total_ask > 0 else 0
    yield_ = result.total_revenue / total_rpk if total_rpk > 0 else 0
    load_factor = result.total_expected_seats / cap if cap > 0 else 0

    fc_metrics = []
    for fc in result.fare_classes:
        fc_ask = int(cap * route[f"capacity_{fc.fare_class}_frac"]) * dist_km
        fc_rpk = fc.expected_demand * dist_km
        fc_metrics.append({
            "fare_class": fc.fare_class,
            "optimal_price_inr": fc.optimal_price,
            "expected_demand_seats": fc.expected_demand,
            "revenue_inr": fc.expected_revenue,
            "rask_inr_per_km": round(fc.expected_revenue / fc_ask, 4) if fc_ask > 0 else 0,
            "yield_inr_per_rpk": round(fc.expected_revenue / fc_rpk, 4) if fc_rpk > 0 else 0,
        })

    # DGCA monthly pax trend for the route (latest 6 months available)
    pax_trend = [
        {"year": yr, "month": mo, "pax_both_directions": pax}
        for (yr, mo), pax in sorted(DGCA_ROUTE_MONTHLY_PAX.get(route_id, {}).items())[-6:]
    ]

    return {
        "route_id": route_id,
        "distance_km": dist_km,
        "total_capacity_seats": cap,
        "kpis": {
            "rask_inr_per_km": round(rask, 4),
            "prask_inr_per_km": round(rask, 4),
            "yield_inr_per_rpk": round(yield_, 4),
            "load_factor_pct": round(load_factor * 100, 2),
            "total_revenue_inr": result.total_revenue,
            "ask_km": total_ask,
            "rpk_km": round(total_rpk, 1),
        },
        "fare_class_breakdown": fc_metrics,
        "dgca_monthly_pax": pax_trend,
        "solver_time_ms": result.solver_time_ms,
    }


@app.get("/health")
def health():
    return {"status": "ok", "service": "PriceIQ API"}


# ── Serve React frontend in production (when dist/ exists) ───────────────────

_FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

if os.path.isdir(_FRONTEND_DIST):
    _ASSETS = os.path.join(_FRONTEND_DIST, "assets")
    if os.path.isdir(_ASSETS):
        app.mount("/assets", StaticFiles(directory=_ASSETS), name="assets")

    @app.get(
        "/{full_path:path}",
        include_in_schema=False,
        responses={404: {"description": "Frontend index.html not found in dist/"}},
    )
    async def serve_spa(full_path: str):
        index = os.path.join(_FRONTEND_DIST, "index.html")
        if os.path.isfile(index):
            return FileResponse(index)
        raise HTTPException(status_code=404, detail="Frontend not built — run `npm run build` in frontend/")

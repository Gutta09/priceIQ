from dataclasses import dataclass, field
from functools import lru_cache
from typing import Optional
import time
import numpy as np
from ortools.linear_solver import pywraplp

from data import FARE_CLASSES


@dataclass(frozen=True)
class FareClassParams:
    """Frozen (hashable) so parameter sets can key the solve cache."""
    name: str
    base_price: float
    base_demand: float
    elasticity: float
    capacity: int
    min_price: float
    max_price: float


@dataclass
class FareClassResult:
    fare_class: str
    optimal_price: float
    expected_demand: float
    expected_revenue: float


@dataclass
class OptimizationResult:
    status: str
    fare_classes: list[FareClassResult] = field(default_factory=list)
    total_revenue: float = 0.0
    total_expected_seats: float = 0.0
    solver_time_ms: float = 0.0
    message: str = ""


SOLVER_TIME_LIMIT_MS = 10_000

SCENARIO_MULTIPLIERS = {
    "off_peak": {"demand_mult": 0.60, "label": "Off-Peak"},
    "low":      {"demand_mult": 0.80, "label": "Low Demand"},
    "medium":   {"demand_mult": 1.00, "label": "Baseline"},
    "high":     {"demand_mult": 1.30, "label": "High Demand"},
    "peak":     {"demand_mult": 1.65, "label": "Peak Season"},
}


def compute_demand(
    price: float,
    base_price: float,
    base_demand: float,
    elasticity: float,
    demand_multiplier: float = 1.0,
) -> float:
    """Constant-elasticity demand: D(p) = D0 · m · (p/p0)^(−e)."""
    if price <= 0:
        return 0.0
    return base_demand * demand_multiplier * (price / base_price) ** (-elasticity)


def generate_price_candidates(fc: FareClassParams, n_candidates: int = 50) -> np.ndarray:
    return np.linspace(fc.min_price, fc.max_price, n_candidates)


def solve_pricing_mip(
    fare_classes: list[FareClassParams],
    total_capacity: int,
    demand_multiplier: float = 1.0,
    n_candidates: int = 50,
) -> OptimizationResult:
    """Cached front-end for the CBC solve — inputs are deterministic, so
    identical requests are answered from memory."""
    return _solve_pricing_mip_cached(
        tuple(fare_classes), total_capacity, demand_multiplier, n_candidates
    )


@lru_cache(maxsize=256)
def _solve_pricing_mip_cached(
    fare_classes: tuple,
    total_capacity: int,
    demand_multiplier: float,
    n_candidates: int,
) -> OptimizationResult:
    t0 = time.perf_counter()

    solver = pywraplp.Solver.CreateSolver("CBC_MIXED_INTEGER_PROGRAMMING")
    if not solver:
        return OptimizationResult(status="ERROR", message="Could not create CBC solver")

    solver.SetTimeLimit(SOLVER_TIME_LIMIT_MS)

    price_candidates = [generate_price_candidates(fc, n_candidates) for fc in fare_classes]

    # Pre-compute demand and revenue coefficients.
    # Expected boardings are truncated at cabin capacity: you cannot sell more
    # seats than the cabin holds, so demand beyond capacity earns no revenue.
    # This also guarantees per-class load factor <= 100%.
    demand_coeffs = []
    revenue_coeffs = []
    for c_idx, fc in enumerate(fare_classes):
        d_row = []
        r_row = []
        for price in price_candidates[c_idx]:
            d_raw = compute_demand(price, fc.base_price, fc.base_demand, fc.elasticity, demand_multiplier)
            d = min(d_raw, float(fc.capacity))
            d_row.append(d)
            r_row.append(price * d)
        demand_coeffs.append(d_row)
        revenue_coeffs.append(r_row)

    # Decision variables: x[c][k] = 1 if class c uses price candidate k
    x = []
    for c_idx, fc in enumerate(fare_classes):
        x.append([solver.BoolVar(f"x_{fc.name}_{k}") for k in range(n_candidates)])

    # Constraint 1: exactly one price per class
    for c_idx, fc in enumerate(fare_classes):
        ct = solver.Constraint(1, 1, f"one_price_{fc.name}")
        for k in range(n_candidates):
            ct.SetCoefficient(x[c_idx][k], 1)

    # Constraint 2: total expected boardings <= aircraft capacity
    # (couples the classes — this is what makes the problem a joint MIP rather
    # than three independent 1-D maximisations)
    ct_cap = solver.Constraint(-solver.infinity(), float(total_capacity), "total_capacity")
    for c_idx in range(len(fare_classes)):
        for k in range(n_candidates):
            ct_cap.SetCoefficient(x[c_idx][k], demand_coeffs[c_idx][k])

    # Objective: maximize total expected revenue
    objective = solver.Objective()
    objective.SetMaximization()
    for c_idx in range(len(fare_classes)):
        for k in range(n_candidates):
            objective.SetCoefficient(x[c_idx][k], revenue_coeffs[c_idx][k])

    status_code = solver.Solve()
    elapsed_ms = (time.perf_counter() - t0) * 1000

    status_map = {
        pywraplp.Solver.OPTIMAL: "OPTIMAL",
        pywraplp.Solver.FEASIBLE: "FEASIBLE",
        pywraplp.Solver.INFEASIBLE: "INFEASIBLE",
        pywraplp.Solver.UNBOUNDED: "UNBOUNDED",
        pywraplp.Solver.ABNORMAL: "ABNORMAL",
        pywraplp.Solver.NOT_SOLVED: "NOT_SOLVED",
    }
    status_str = status_map.get(status_code, "UNKNOWN")

    if status_code not in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
        return OptimizationResult(
            status=status_str,
            solver_time_ms=round(elapsed_ms, 2),
            message=f"Solver returned {status_str}. Try relaxing capacity or price bounds.",
        )

    results = []
    total_revenue = 0.0
    total_seats = 0.0
    for c_idx, fc in enumerate(fare_classes):
        best_k = max(range(n_candidates), key=lambda k: x[c_idx][k].solution_value())
        results.append(FareClassResult(
            fare_class=fc.name,
            optimal_price=round(float(price_candidates[c_idx][best_k]), 2),
            expected_demand=round(demand_coeffs[c_idx][best_k], 2),
            expected_revenue=round(revenue_coeffs[c_idx][best_k], 2),
        ))
        total_revenue += revenue_coeffs[c_idx][best_k]
        total_seats += demand_coeffs[c_idx][best_k]

    return OptimizationResult(
        status=status_str,
        fare_classes=results,
        total_revenue=round(total_revenue, 2),
        total_expected_seats=round(total_seats, 2),
        solver_time_ms=round(elapsed_ms, 2),
    )


def build_fare_class_params(route: dict, overrides: Optional[dict] = None) -> list[FareClassParams]:
    overrides = overrides or {}
    fare_classes = []
    for fc_name in FARE_CLASSES:
        base_price = route[f"base_price_{fc_name}"]
        dp = route["demand_params"][fc_name]
        override = overrides.get(f"{fc_name}_elasticity")
        elasticity = override if override is not None else dp["elasticity"]
        cap_frac = route[f"capacity_{fc_name}_frac"]
        capacity = int(route["total_capacity"] * cap_frac)
        fare_classes.append(FareClassParams(
            name=fc_name,
            base_price=base_price,
            base_demand=dp["base_demand"],
            elasticity=elasticity,
            capacity=capacity,
            min_price=round(base_price * route["price_floor_mult"], 2),
            max_price=round(base_price * route["price_ceil_mult"], 2),
        ))
    return fare_classes


def generate_scenarios(
    route: dict,
    total_capacity: int,
    overrides: Optional[dict] = None,
) -> list:
    fare_classes = build_fare_class_params(route, overrides)
    scenarios = []
    for scenario_key, scenario_meta in SCENARIO_MULTIPLIERS.items():
        result = solve_pricing_mip(
            fare_classes=fare_classes,
            total_capacity=total_capacity,
            demand_multiplier=scenario_meta["demand_mult"],
        )
        row: dict = {
            "scenario": scenario_key,
            "label": scenario_meta["label"],
            "demand_multiplier": scenario_meta["demand_mult"],
            "status": result.status,
            "total_revenue": result.total_revenue,
            "total_expected_seats": result.total_expected_seats,
            "load_factor": round(result.total_expected_seats / total_capacity, 4) if total_capacity > 0 else 0.0,
        }
        for fc_result in result.fare_classes:
            row[f"{fc_result.fare_class}_price"] = fc_result.optimal_price
            row[f"{fc_result.fare_class}_demand"] = fc_result.expected_demand
            row[f"{fc_result.fare_class}_revenue"] = fc_result.expected_revenue
        scenarios.append(row)
    return scenarios

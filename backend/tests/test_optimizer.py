import math

import pytest

from optimizer import (
    FareClassParams,
    build_fare_class_params,
    compute_demand,
    solve_pricing_mip,
)
from data import FARE_CLASSES, get_route


def make_class(name="economy", base_price=5000.0, base_demand=100.0,
               elasticity=1.5, capacity=130, floor=0.5, ceil=3.0):
    return FareClassParams(
        name=name,
        base_price=base_price,
        base_demand=base_demand,
        elasticity=elasticity,
        capacity=capacity,
        min_price=base_price * floor,
        max_price=base_price * ceil,
    )


def test_demand_is_decreasing_in_price():
    d_low = compute_demand(4000, 5000, 100, 1.5)
    d_high = compute_demand(8000, 5000, 100, 1.5)
    assert d_low > d_high > 0


def test_demand_at_base_price_equals_base_demand():
    assert compute_demand(5000, 5000, 100, 1.5) == pytest.approx(100.0)


def test_elastic_class_priced_at_floor_when_capacity_slack():
    """Revenue ∝ p^(1-e). With e > 1 revenue falls as price rises, so with no
    binding capacity the optimum is the lowest candidate price — except that
    demand truncation at cabin capacity flattens revenue below the price where
    demand hits capacity. The optimizer should pick the highest price at which
    the cabin still sells out."""
    fc = make_class(elasticity=1.8, base_demand=50.0, capacity=1000)
    result = solve_pricing_mip([fc], total_capacity=1000, n_candidates=50)
    assert result.status == "OPTIMAL"
    # capacity 1000 never binds (max demand at floor = 50·2^1.8 ≈ 174)
    assert result.fare_classes[0].optimal_price == pytest.approx(fc.min_price)


def test_inelastic_class_priced_at_ceiling():
    """With e < 1, revenue rises with price, so the optimum is the ceiling."""
    fc = make_class(elasticity=0.5, base_demand=6.0, capacity=8)
    result = solve_pricing_mip([fc], total_capacity=200, n_candidates=50)
    assert result.status == "OPTIMAL"
    assert result.fare_classes[0].optimal_price == pytest.approx(fc.max_price)


def test_expected_demand_never_exceeds_cabin_capacity():
    """Regression test: boardings must be truncated at each cabin's size."""
    fc = make_class(elasticity=1.8, base_demand=200.0, capacity=130)
    result = solve_pricing_mip([fc], total_capacity=164, demand_multiplier=2.0)
    assert result.status == "OPTIMAL"
    assert result.fare_classes[0].expected_demand <= 130 + 1e-6


def test_total_capacity_constraint_binds():
    classes = [
        make_class("economy", 5000, 200.0, 1.7, capacity=131),
        make_class("premium", 9000, 40.0, 1.0, capacity=24),
        make_class("business", 20000, 12.0, 0.5, capacity=8),
    ]
    result = solve_pricing_mip(classes, total_capacity=164, demand_multiplier=1.5)
    assert result.status == "OPTIMAL"
    assert result.total_expected_seats <= 164 + 1e-6


def test_revenue_monotone_in_demand_multiplier():
    """More demand can never reduce optimal revenue."""
    classes = [make_class()]
    revenues = [
        solve_pricing_mip(classes, total_capacity=164, demand_multiplier=m).total_revenue
        for m in (0.6, 1.0, 1.5)
    ]
    assert revenues == sorted(revenues)


def test_solve_is_deterministic_and_cached():
    classes = [make_class()]
    r1 = solve_pricing_mip(classes, total_capacity=164)
    r2 = solve_pricing_mip(classes, total_capacity=164)
    assert r1.total_revenue == r2.total_revenue
    assert r1.fare_classes[0].optimal_price == r2.fare_classes[0].optimal_price


def test_build_fare_class_params_from_seeded_route():
    route = get_route("DEL-BOM")
    params = build_fare_class_params(route)
    assert [p.name for p in params] == list(FARE_CLASSES)
    # Cabin split must consume (almost) the whole aircraft
    assert sum(p.capacity for p in params) <= route["total_capacity"]
    assert sum(p.capacity for p in params) >= route["total_capacity"] - len(FARE_CLASSES)


def test_elasticity_override_is_applied():
    route = get_route("DEL-BOM")
    params = build_fare_class_params(route, {"economy_elasticity": 2.5})
    econ = next(p for p in params if p.name == "economy")
    assert econ.elasticity == pytest.approx(2.5)


def test_revenue_equals_price_times_demand_per_class():
    route = get_route("DEL-BOM")
    params = build_fare_class_params(route)
    result = solve_pricing_mip(params, route["total_capacity"])
    assert result.status == "OPTIMAL"
    for fc in result.fare_classes:
        assert fc.expected_revenue == pytest.approx(
            fc.optimal_price * fc.expected_demand, rel=1e-2
        )
    assert result.total_revenue == pytest.approx(
        sum(fc.expected_revenue for fc in result.fare_classes), rel=1e-6
    )
    assert math.isfinite(result.solver_time_ms)

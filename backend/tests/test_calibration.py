import numpy as np
import pytest

from calibration import calibrate_fare_class, run_full_calibration
from data import FARE_CLASSES, ROUTES_SEED


def test_recovers_known_parameters_without_noise():
    """Exact power-law data → OLS must recover the generating parameters."""
    rng = np.random.default_rng(7)
    base_price, true_bd, true_e = 5000.0, 120.0, 1.6
    prices = rng.uniform(2500, 15000, size=200)
    demands = true_bd * (prices / base_price) ** (-true_e)

    bd, e, r2, rmse, ok = calibrate_fare_class(prices, demands, base_price, 1.0, 1.0)
    assert ok
    assert bd == pytest.approx(true_bd, rel=1e-6)
    assert e == pytest.approx(true_e, rel=1e-6)
    assert r2 == pytest.approx(1.0, abs=1e-9)


def test_recovers_parameters_with_noise_within_tolerance():
    rng = np.random.default_rng(11)
    base_price, true_bd, true_e = 8000.0, 20.0, 0.9
    prices = rng.uniform(4000, 24000, size=500)
    demands = true_bd * (prices / base_price) ** (-true_e) * rng.uniform(0.95, 1.05, size=500)

    bd, e, r2, rmse, ok = calibrate_fare_class(prices, demands, base_price, 1.0, 1.0)
    assert ok
    assert bd == pytest.approx(true_bd, rel=0.05)
    assert e == pytest.approx(true_e, rel=0.10)
    assert r2 > 0.9


def test_too_few_observations_reports_no_convergence():
    prices = np.array([5000.0, 6000.0])
    demands = np.array([100.0, 90.0])
    bd, e, r2, rmse, ok = calibrate_fare_class(prices, demands, 5000.0, 42.0, 1.23)
    assert not ok
    assert bd == 42.0 and e == 1.23  # falls back to current values


def test_full_calibration_covers_all_routes_and_classes(seeded_db):
    report = run_full_calibration()
    assert report["routes_calibrated"] == len(ROUTES_SEED)
    assert report["total_fare_classes"] == len(ROUTES_SEED) * len(FARE_CLASSES)
    assert all(r["convergence"] for r in report["results"])
    # Synthetic data is generated from the same functional form, so the fit
    # must be tight — this is the simulation-study guarantee.
    assert report["avg_r_squared"] > 0.85
    assert "synthetic" in report["data_note"]


def test_single_route_calibration(seeded_db):
    report = run_full_calibration("DEL-BOM")
    assert report["routes_calibrated"] == 1
    assert {r["route_id"] for r in report["results"]} == {"DEL-BOM"}
    # Elasticities recovered within 15% of the seed values used to generate data
    for r in report["results"]:
        assert r["fitted_elasticity"] == pytest.approx(r["current_elasticity"], rel=0.15)

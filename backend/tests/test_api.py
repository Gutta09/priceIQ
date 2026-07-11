import pytest
from fastapi.testclient import TestClient

import data
from main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:  # context manager triggers lifespan (init + seed)
        yield c


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_routes_lists_all_seeded_routes(client):
    r = client.get("/routes")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == len(data.ROUTES_SEED)
    first = body[0]
    assert "demand_params" in first
    assert set(first["demand_params"].keys()) == set(data.FARE_CLASSES)


def test_optimize_unknown_route_is_404(client):
    r = client.post("/optimize", json={"route_id": "XXX-YYY"})
    assert r.status_code == 404


def test_optimize_returns_prices_within_bounds(client):
    r = client.post("/optimize", json={"route_id": "DEL-BOM"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in ("OPTIMAL", "FEASIBLE")
    assert len(body["fare_classes"]) == len(data.FARE_CLASSES)

    route = data.get_route("DEL-BOM")
    for fc in body["fare_classes"]:
        base = route[f"base_price_{fc['fare_class']}"]
        assert base * route["price_floor_mult"] - 1 <= fc["optimal_price"] <= base * route["price_ceil_mult"] + 1
        cabin = int(route["total_capacity"] * route[f"capacity_{fc['fare_class']}_frac"])
        assert fc["expected_demand"] <= cabin + 1e-6


def test_optimize_rejects_absurd_capacity(client):
    r = client.post("/optimize", json={"route_id": "DEL-BOM", "total_capacity": 10**9})
    assert r.status_code == 422


def test_optimize_rejects_out_of_range_elasticity(client):
    r = client.post("/optimize", json={"route_id": "DEL-BOM", "economy_elasticity": 99})
    assert r.status_code == 422


def test_scenarios_shape_and_capacity(client):
    r = client.get("/scenarios", params={"route_id": "DEL-BOM"})
    assert r.status_code == 200
    rows = r.json()
    assert [row["scenario"] for row in rows] == ["off_peak", "low", "medium", "high", "peak"]
    for row in rows:
        assert row["load_factor"] <= 1.0 + 1e-6
        assert row["total_expected_seats"] <= 164 + 1e-6


def test_scenarios_rejects_absurd_capacity(client):
    r = client.get("/scenarios", params={"route_id": "DEL-BOM", "total_capacity": 10**9})
    assert r.status_code == 422


def test_metrics_kpis_are_consistent(client):
    r = client.get("/metrics/DEL-BOM")
    assert r.status_code == 200
    body = r.json()
    kpis = body["kpis"]
    assert 0 < kpis["load_factor_pct"] <= 100.0
    # RASK · ASK == total revenue (round-off tolerance)
    assert kpis["rask_inr_per_km"] * kpis["ask_km"] == pytest.approx(
        kpis["total_revenue_inr"], rel=1e-3
    )


def test_dgca_endpoint_serves_embedded_series(client):
    r = client.get("/dgca")
    assert r.status_code == 200
    body = r.json()
    assert len(body["market_plf_series"]) == len(data.DGCA_MARKET_PLF)
    assert "DEL-BOM" in body["route_monthly_pax"]


def test_calibrate_endpoint(client):
    r = client.post("/calibrate", params={"route_id": "DEL-BOM"})
    assert r.status_code == 200
    assert r.json()["routes_calibrated"] == 1

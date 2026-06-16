from dataclasses import dataclass
from datetime import datetime
from typing import Optional
import numpy as np
import pandas as pd

from data import get_all_routes, get_historical_bookings


@dataclass
class CalibrationResult:
    route_id: str
    fare_class: str
    current_base_demand: float
    fitted_base_demand: float
    current_elasticity: float
    fitted_elasticity: float
    r_squared: float
    rmse: float
    n_observations: int
    convergence: bool
    pct_change_base_demand: float
    pct_change_elasticity: float


def _r_squared(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    ss_res = np.sum((y_true - y_pred) ** 2)
    ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)
    return float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0


def calibrate_fare_class(
    prices: np.ndarray,
    demands: np.ndarray,
    base_price: float,
    current_base_demand: float,
    current_elasticity: float,
) -> tuple[float, float, float, float, bool]:
    """Returns (fitted_base_demand, fitted_elasticity, r_squared, rmse, convergence)."""
    mask = (demands > 0) & (prices > 0)
    prices = prices[mask]
    demands = demands[mask]
    n = len(prices)

    if n < 3:
        return current_base_demand, current_elasticity, 0.0, float("inf"), False

    log_demand = np.log(demands.astype(float))
    log_price_ratio = np.log(prices.astype(float) / base_price)

    # OLS: log_demand = intercept + slope * log_price_ratio
    coeffs = np.polyfit(log_price_ratio, log_demand, 1)
    fitted_elasticity = float(-coeffs[0])
    fitted_base_demand = float(np.exp(coeffs[1]))

    # Clamp to physically meaningful range
    fitted_elasticity = max(0.1, min(fitted_elasticity, 5.0))
    fitted_base_demand = max(1.0, fitted_base_demand)

    predicted_demands = fitted_base_demand * (prices / base_price) ** (-fitted_elasticity)
    r2 = _r_squared(demands, predicted_demands)
    rmse = float(np.sqrt(np.mean((demands - predicted_demands) ** 2)))

    return fitted_base_demand, fitted_elasticity, r2, rmse, True


def calibrate_route(route: dict) -> list[CalibrationResult]:
    route_id = route["route_id"]
    df = get_historical_bookings(route_id, days=90)
    results = []

    for fare_class in ["economy", "business", "first"]:
        fc_df = df[df["fare_class"] == fare_class].copy()
        dp = route["demand_params"][fare_class]
        base_price = route[f"base_price_{fare_class}"]

        prices = fc_df["price_charged"].to_numpy()
        demands = fc_df["seats_sold"].to_numpy()

        fitted_bd, fitted_e, r2, rmse, converged = calibrate_fare_class(
            prices, demands, base_price, dp["base_demand"], dp["elasticity"]
        )

        pct_change_bd = (fitted_bd - dp["base_demand"]) / dp["base_demand"] * 100
        pct_change_e = (fitted_e - dp["elasticity"]) / dp["elasticity"] * 100

        results.append(CalibrationResult(
            route_id=route_id,
            fare_class=fare_class,
            current_base_demand=round(dp["base_demand"], 2),
            fitted_base_demand=round(fitted_bd, 2),
            current_elasticity=round(dp["elasticity"], 4),
            fitted_elasticity=round(fitted_e, 4),
            r_squared=round(r2, 4),
            rmse=round(rmse, 4),
            n_observations=len(prices),
            convergence=converged,
            pct_change_base_demand=round(pct_change_bd, 2),
            pct_change_elasticity=round(pct_change_e, 2),
        ))

    return results


def _generate_recommendations(results: list[CalibrationResult]) -> list[str]:
    recommendations = []
    for r in results:
        fc_label = r.fare_class.capitalize()
        if abs(r.pct_change_elasticity) > 10:
            direction = "increased" if r.pct_change_elasticity > 0 else "decreased"
            action = "consider raising price floor" if r.pct_change_elasticity > 0 else "consider lowering price ceiling"
            recommendations.append(
                f"{fc_label} on {r.route_id}: elasticity {direction} {abs(r.pct_change_elasticity):.1f}% — {action}."
            )
        if abs(r.pct_change_base_demand) > 10:
            direction = "up" if r.pct_change_base_demand > 0 else "down"
            recommendations.append(
                f"{fc_label} on {r.route_id}: base demand revised {direction} {abs(r.pct_change_base_demand):.1f}% — update capacity allocation."
            )
        if r.r_squared < 0.70 and r.convergence:
            recommendations.append(
                f"{fc_label} on {r.route_id}: low R²={r.r_squared:.2f} — demand may not follow power-law; consider richer model."
            )
    if not recommendations:
        recommendations.append("All parameters within 10% of current values — no immediate retuning required.")
    return recommendations


def run_full_calibration(route_id: Optional[str] = None) -> dict:
    routes = get_all_routes()
    if route_id:
        routes = [r for r in routes if r["route_id"] == route_id]

    all_results: list[CalibrationResult] = []
    for route in routes:
        all_results.extend(calibrate_route(route))

    recommendations = _generate_recommendations(all_results)

    r2_values = [r.r_squared for r in all_results if r.convergence]
    rmse_values = [r.rmse for r in all_results if r.convergence]

    return {
        "routes_calibrated": len(routes),
        "total_fare_classes": len(all_results),
        "avg_r_squared": round(float(np.mean(r2_values)), 4) if r2_values else 0.0,
        "avg_rmse": round(float(np.mean(rmse_values)), 4) if rmse_values else 0.0,
        "results": [
            {
                "route_id": r.route_id,
                "fare_class": r.fare_class,
                "current_base_demand": r.current_base_demand,
                "fitted_base_demand": r.fitted_base_demand,
                "current_elasticity": r.current_elasticity,
                "fitted_elasticity": r.fitted_elasticity,
                "r_squared": r.r_squared,
                "rmse": r.rmse,
                "n_observations": r.n_observations,
                "convergence": r.convergence,
                "pct_change_base_demand": r.pct_change_base_demand,
                "pct_change_elasticity": r.pct_change_elasticity,
            }
            for r in all_results
        ],
        "recommendations": recommendations,
        "calibration_timestamp": datetime.utcnow().isoformat() + "Z",
    }

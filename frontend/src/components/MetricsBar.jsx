import { useEffect, useState } from 'react'
import { getMetrics } from '../api'

function KpiCard({ label, value, unit, sub, color = 'text-white' }) {
  return (
    <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-3 flex-1 min-w-0">
      <div className="text-xs text-gray-500 uppercase tracking-widest truncate">{label}</div>
      <div className={`text-xl font-bold mt-0.5 ${color}`}>
        {value}<span className="text-sm font-normal text-gray-500 ml-0.5">{unit}</span>
      </div>
      {sub && <div className="text-xs text-gray-600 mt-0.5 truncate">{sub}</div>}
    </div>
  )
}

export default function MetricsBar({ selectedRoute }) {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedRoute) return
    setMetrics(null)
    setLoading(true)
    getMetrics(selectedRoute.route_id)
      .then(res => setMetrics(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [selectedRoute?.route_id])

  if (!selectedRoute) return null

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-widest">Revenue KPIs</div>
          <div className="text-xs text-gray-600 mt-0.5">
            RASK · PRASK · Yield — standard airline revenue-management metrics
          </div>
        </div>
        {metrics && (
          <div className="text-xs text-gray-600">
            Solver {metrics.solver_time_ms?.toFixed(0)}ms · {metrics.distance_km} km
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-gray-600 py-2">
          <svg className="animate-spin h-3 w-3 text-indigo-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Computing KPIs…
        </div>
      )}

      {metrics && (
        <>
          <div className="flex gap-3 flex-wrap">
            <KpiCard
              label="RASK"
              value={`₹${metrics.kpis.rask_inr_per_km.toFixed(2)}`}
              unit="/km"
              sub="Revenue per Available Seat-Km"
              color="text-green-400"
            />
            <KpiCard
              label="Yield"
              value={`₹${metrics.kpis.yield_inr_per_rpk.toFixed(2)}`}
              unit="/RPK"
              sub="Revenue per Revenue Passenger-Km"
              color="text-blue-400"
            />
            <KpiCard
              label="Load Factor"
              value={`${metrics.kpis.load_factor_pct.toFixed(1)}`}
              unit="%"
              sub={`${Math.round(metrics.kpis.rpk_km).toLocaleString('en-IN')} RPK`}
              color="text-amber-400"
            />
            <KpiCard
              label="Revenue / Flight"
              value={`₹${(metrics.kpis.total_revenue_inr / 1_00_000).toFixed(2)}L`}
              unit=""
              sub={`ASK ${(metrics.kpis.ask_km / 1_000).toFixed(0)}k seat-km`}
              color="text-purple-400"
            />
          </div>

          {/* Per-class breakdown */}
          <div className="mt-3 border-t border-gray-800 pt-3">
            <div className="text-xs text-gray-500 mb-2 uppercase tracking-widest">Fare class RASK</div>
            <div className="grid grid-cols-3 gap-2">
              {metrics.fare_class_breakdown.map(fc => {
                const colors = { economy: 'text-green-400', business: 'text-blue-400', first: 'text-purple-400' }
                return (
                  <div key={fc.fare_class} className="bg-gray-800 rounded-lg p-2 text-xs">
                    <div className={`font-semibold capitalize ${colors[fc.fare_class] ?? 'text-gray-300'}`}>
                      {fc.fare_class}
                    </div>
                    <div className="text-gray-300 mt-0.5">
                      RASK <span className="text-white font-bold">₹{fc.rask_inr_per_km.toFixed(2)}</span>
                    </div>
                    <div className="text-gray-500">
                      Yield ₹{fc.yield_inr_per_rpk.toFixed(2)}/RPK
                    </div>
                    <div className="text-gray-500">
                      {fc.expected_demand_seats.toFixed(1)} seats · ₹{(fc.revenue_inr / 1000).toFixed(0)}k
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

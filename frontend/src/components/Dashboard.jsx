import { useState, useEffect, useRef, useCallback } from 'react'
import { getRoutes, optimize, getScenarios } from '../api'
import { FARE_CLASSES } from '../fareClasses'
import { fmtINR, fmtPrice } from '../utils/format'
import RouteSelector from './RouteSelector'
import OptimizationControls from './OptimizationControls'
import RevenueCurveChart from './RevenueCurveChart'
import ScenarioTable from './ScenarioTable'
import CalibrationReport from './CalibrationReport'
import MetricsBar from './MetricsBar'
import DgcaChart from './DgcaChart'

function StatCard({ label, value, sub, color = 'text-white' }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
      <div className="text-xs text-gray-400 uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const [routes, setRoutes] = useState([])
  const [routesError, setRoutesError] = useState(null)
  const [selectedRoute, setSelectedRoute] = useState(null)
  const [capacity, setCapacity] = useState(164)
  const [demandMultiplier, setDemandMultiplier] = useState(1.0)
  const [elasticityOverride, setElasticityOverride] = useState({ economy: null, premium: null, business: null })
  const [optimizationResult, setOptimizationResult] = useState(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optError, setOptError] = useState(null)
  const [scenarios, setScenarios] = useState([])
  const [scenariosLoading, setScenariosLoading] = useState(false)

  // Aborts in-flight optimize/scenario requests when a newer one starts, so a
  // slow response for a previously selected route can never overwrite the UI.
  const optimizeAbort = useRef(null)
  const scenariosAbort = useRef(null)

  const runOptimize = useCallback(async (route, cap, mult, overrides) => {
    if (!route) return
    optimizeAbort.current?.abort()
    const controller = new AbortController()
    optimizeAbort.current = controller

    setIsOptimizing(true)
    setOptError(null)
    try {
      const payload = {
        route_id: route.route_id,
        total_capacity: cap,
        demand_multiplier: mult,
      }
      for (const { key } of FARE_CLASSES) {
        if (overrides[key] != null) payload[`${key}_elasticity`] = overrides[key]
      }
      const res = await optimize(payload, controller.signal)
      setOptimizationResult(res.data)
      setIsOptimizing(false)
    } catch (err) {
      if (controller.signal.aborted) return // superseded by a newer request
      setOptError(err?.response?.data?.detail ?? 'Optimization failed')
      setIsOptimizing(false)
    }
  }, [])

  const loadScenarios = useCallback(async (route, cap) => {
    if (!route) return
    scenariosAbort.current?.abort()
    const controller = new AbortController()
    scenariosAbort.current = controller

    setScenariosLoading(true)
    try {
      const res = await getScenarios(route.route_id, cap, controller.signal)
      setScenarios(res.data)
      setScenariosLoading(false)
    } catch {
      if (controller.signal.aborted) return
      setScenarios([])
      setScenariosLoading(false)
    }
  }, [])

  useEffect(() => {
    getRoutes()
      .then((res) => {
        setRoutes(res.data)
        if (res.data.length > 0) {
          const first = res.data.find(r => r.route_id === 'DEL-BOM') ?? res.data[0]
          setSelectedRoute(first)
          setCapacity(first.total_capacity)
          // Kick off the first optimization with the default controls
          runOptimize(first, first.total_capacity, 1.0, { economy: null, premium: null, business: null })
          loadScenarios(first, first.total_capacity)
        }
      })
      .catch(() => setRoutesError('Could not reach the PriceIQ API. Is the backend running?'))
  }, [runOptimize, loadScenarios])

  const handleRouteChange = (route) => {
    setSelectedRoute(route)
    setCapacity(route.total_capacity)
    setOptimizationResult(null)
    setScenarios([])
    runOptimize(route, route.total_capacity, demandMultiplier, elasticityOverride)
    loadScenarios(route, route.total_capacity)
  }

  const handleOptimize = () => {
    runOptimize(selectedRoute, capacity, demandMultiplier, elasticityOverride)
    loadScenarios(selectedRoute, capacity)
  }

  const fcResult = (key) => optimizationResult?.fare_classes?.find((fc) => fc.fare_class === key)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            P
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">PriceIQ</h1>
            <p className="text-xs text-gray-500">Indian Domestic Airline Dynamic Pricing · OR-Tools CBC</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/Vonter/india-aviation-traffic"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block"></span>
            DGCA Data
          </a>
          <div className="text-xs text-gray-500">FastAPI · SQLite</div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {routesError && (
          <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm" role="alert">
            {routesError}
          </div>
        )}

        {/* Top row: controls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <RouteSelector
            routes={routes}
            selectedRoute={selectedRoute}
            onRouteChange={handleRouteChange}
          />
          <div className="lg:col-span-2">
            <OptimizationControls
              capacity={capacity}
              setCapacity={setCapacity}
              demandMultiplier={demandMultiplier}
              setDemandMultiplier={setDemandMultiplier}
              elasticityOverride={elasticityOverride}
              setElasticityOverride={setElasticityOverride}
              onOptimize={handleOptimize}
              isOptimizing={isOptimizing}
              selectedRoute={selectedRoute}
            />
          </div>
        </div>

        {optError && (
          <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm" role="alert">
            {optError}
          </div>
        )}

        {/* KPI cards */}
        {optimizationResult && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="Total Revenue"
              value={fmtINR(optimizationResult.total_revenue, { dash: true })}
              sub={`${optimizationResult.status} · ${optimizationResult.solver_time_ms.toFixed(1)}ms`}
              color="text-green-400"
            />
            {FARE_CLASSES.map(({ key, label, text }) => {
              const r = fcResult(key)
              return (
                <StatCard
                  key={key}
                  label={`${label} Price`}
                  value={r ? fmtPrice(r.optimal_price) : '—'}
                  sub={r ? `${r.expected_demand.toFixed(1)} seats · ${fmtINR(r.expected_revenue)}` : ''}
                  color={text}
                />
              )
            })}
          </div>
        )}

        {/* Chart + Scenarios */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-3">
            <RevenueCurveChart
              optimizationResult={optimizationResult}
              selectedRoute={selectedRoute}
            />
          </div>
          <div className="xl:col-span-2">
            <ScenarioTable scenarios={scenarios} loading={scenariosLoading} capacity={capacity} />
          </div>
        </div>

        {/* Airline KPIs + DGCA PLF trend */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-3">
            <MetricsBar selectedRoute={selectedRoute} />
          </div>
          <div className="xl:col-span-2">
            <DgcaChart selectedRoute={selectedRoute} />
          </div>
        </div>

        {/* Calibration — keyed by route so switching routes resets the report */}
        <CalibrationReport
          key={selectedRoute?.route_id ?? 'none'}
          selectedRoute={selectedRoute}
        />

        {/* Data provenance footer */}
        <div className="border-t border-gray-800 pt-4 flex flex-wrap gap-4 items-center justify-between text-xs text-gray-500">
          <div>
            PLF &amp; passenger data: real DGCA monthly reports (via{' '}
            <a href="https://github.com/Vonter/india-aviation-traffic" target="_blank" rel="noreferrer"
               className="hover:text-gray-300 underline underline-offset-2">
              Vonter/india-aviation-traffic
            </a>
            ) · booking history: synthetic, DGCA-anchored simulation
          </div>
          <div>Optimization: OR-Tools CBC MIP · 50 price candidates × 3 fare classes</div>
        </div>
      </div>
    </div>
  )
}

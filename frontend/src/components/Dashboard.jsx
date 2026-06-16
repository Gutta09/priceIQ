import { useState, useEffect, useCallback } from 'react'
import { getRoutes, optimize, getScenarios } from '../api'
import RouteSelector from './RouteSelector'
import OptimizationControls from './OptimizationControls'
import RevenueCurveChart from './RevenueCurveChart'
import ScenarioTable from './ScenarioTable'
import CalibrationReport from './CalibrationReport'
import MetricsBar from './MetricsBar'
import DgcaChart from './DgcaChart'

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

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
  const [selectedRoute, setSelectedRoute] = useState(null)
  const [capacity, setCapacity] = useState(180)
  const [demandMultiplier, setDemandMultiplier] = useState(1.0)
  const [elasticityOverride, setElasticityOverride] = useState({ economy: null, business: null, first: null })
  const [optimizationResult, setOptimizationResult] = useState(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optError, setOptError] = useState(null)
  const [scenarios, setScenarios] = useState([])
  const [scenariosLoading, setScenariosLoading] = useState(false)
  const [calibrationReport, setCalibrationReport] = useState(null)
  const [isCalibrating, setIsCalibrating] = useState(false)

  useEffect(() => {
    getRoutes().then((res) => {
      setRoutes(res.data)
      if (res.data.length > 0) {
        const first = res.data.find(r => r.route_id === 'DEL-BOM') ?? res.data[0]
        setSelectedRoute(first)
        setCapacity(first.total_capacity)
      }
    })
  }, [])

  const runOptimize = useCallback(async (route, cap, mult, overrides) => {
    if (!route) return
    setIsOptimizing(true)
    setOptError(null)
    try {
      const payload = {
        route_id: route.route_id,
        total_capacity: cap,
        demand_multiplier: mult,
        ...(overrides.economy != null ? { economy_elasticity: overrides.economy } : {}),
        ...(overrides.business != null ? { business_elasticity: overrides.business } : {}),
        ...(overrides.first != null ? { first_elasticity: overrides.first } : {}),
      }
      const res = await optimize(payload)
      setOptimizationResult(res.data)
    } catch (err) {
      setOptError(err?.response?.data?.detail ?? 'Optimization failed')
    } finally {
      setIsOptimizing(false)
    }
  }, [])

  const loadScenarios = useCallback(async (route, cap) => {
    if (!route) return
    setScenariosLoading(true)
    try {
      const res = await getScenarios(route.route_id, cap)
      setScenarios(res.data)
    } catch (_) {
      setScenarios([])
    } finally {
      setScenariosLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedRoute) {
      runOptimize(selectedRoute, capacity, demandMultiplier, elasticityOverride)
      loadScenarios(selectedRoute, capacity)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoute])

  const handleRouteChange = (route) => {
    setSelectedRoute(route)
    setCapacity(route.total_capacity)
    setOptimizationResult(null)
    setScenarios([])
    setCalibrationReport(null)
  }

  const handleOptimize = () => {
    runOptimize(selectedRoute, capacity, demandMultiplier, elasticityOverride)
    loadScenarios(selectedRoute, capacity)
  }

  const econResult  = optimizationResult?.fare_classes?.find((fc) => fc.fare_class === 'economy')
  const bizResult   = optimizationResult?.fare_classes?.find((fc) => fc.fare_class === 'business')
  const firstResult = optimizationResult?.fare_classes?.find((fc) => fc.fare_class === 'first')

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
          <div className="text-xs text-gray-600">FastAPI · SQLite</div>
        </div>
      </header>

      <div className="p-6 space-y-6">
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
          <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm">
            {optError}
          </div>
        )}

        {/* KPI cards */}
        {optimizationResult && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="Total Revenue"
              value={fmt(optimizationResult.total_revenue)}
              sub={`${optimizationResult.status} · ${optimizationResult.solver_time_ms.toFixed(1)}ms`}
              color="text-green-400"
            />
            <StatCard
              label="Economy Price"
              value={econResult ? `₹${Math.round(econResult.optimal_price).toLocaleString('en-IN')}` : '—'}
              sub={econResult ? `${econResult.expected_demand.toFixed(1)} seats · ${fmt(econResult.expected_revenue)}` : ''}
              color="text-emerald-400"
            />
            <StatCard
              label="Business Price"
              value={bizResult ? `₹${Math.round(bizResult.optimal_price).toLocaleString('en-IN')}` : '—'}
              sub={bizResult ? `${bizResult.expected_demand.toFixed(1)} seats · ${fmt(bizResult.expected_revenue)}` : ''}
              color="text-blue-400"
            />
            <StatCard
              label="First / Flex Price"
              value={firstResult ? `₹${Math.round(firstResult.optimal_price).toLocaleString('en-IN')}` : '—'}
              sub={firstResult ? `${firstResult.expected_demand.toFixed(1)} seats · ${fmt(firstResult.expected_revenue)}` : ''}
              color="text-purple-400"
            />
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

        {/* Calibration */}
        <CalibrationReport
          calibrationReport={calibrationReport}
          isCalibrating={isCalibrating}
          setIsCalibrating={setIsCalibrating}
          setCalibrationReport={setCalibrationReport}
          selectedRoute={selectedRoute}
        />

        {/* DGCA attribution footer */}
        <div className="border-t border-gray-800 pt-4 flex flex-wrap gap-4 items-center justify-between text-xs text-gray-600">
          <div>
            Demand data: DGCA Scheduled Domestic Monthly Reports (2024–25) ·
            PLF series via{' '}
            <a href="https://github.com/Vonter/india-aviation-traffic" target="_blank" rel="noreferrer"
               className="text-gray-500 hover:text-gray-300 underline underline-offset-2">
              Vonter/india-aviation-traffic
            </a>
          </div>
          <div>Optimization: OR-Tools CBC MIP · 50 price candidates × 3 fare classes</div>
        </div>
      </div>
    </div>
  )
}

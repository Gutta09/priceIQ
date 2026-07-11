import { useState, useMemo } from 'react'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { FARE_CLASSES } from '../fareClasses'
import { fmtINRShort } from '../utils/format'

// NOTE: this mirrors the backend's constant-elasticity model
// (optimizer.compute_demand) for instant client-side curve rendering.
function generateCurve(basePrice, baseDemand, elasticity, minPrice, maxPrice, nPoints = 120) {
  const data = []
  for (let i = 0; i < nPoints; i++) {
    const price = minPrice + (maxPrice - minPrice) * (i / (nPoints - 1))
    const demand = baseDemand * Math.pow(price / basePrice, -elasticity)
    const revenue = price * demand
    data.push({ price: Math.round(price), demand: Math.round(demand * 10) / 10, revenue: Math.round(revenue) })
  }
  return data
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 text-xs shadow-xl">
      <div className="text-gray-400 mb-1">
        Price: <span className="text-white font-bold">₹{label?.toLocaleString('en-IN')}</span>
      </div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}:{' '}
          <span className="font-bold">
            {entry.dataKey === 'revenue' ? fmtINRShort(entry.value) : `${entry.value} seats`}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function RevenueCurveChart({ optimizationResult, selectedRoute }) {
  const [activeTab, setActiveTab] = useState('economy')
  const tab = FARE_CLASSES.find((t) => t.key === activeTab)

  const { curveData, optimalPrice } = useMemo(() => {
    if (!selectedRoute?.demand_params?.[activeTab]) return { curveData: [], optimalPrice: null }
    const dp = selectedRoute.demand_params[activeTab]
    const basePrice = selectedRoute[`base_price_${activeTab}`]
    const floorMult = selectedRoute.price_floor_mult ?? 0.50
    const ceilMult = selectedRoute.price_ceil_mult ?? 3.00
    const data = generateCurve(basePrice, dp.base_demand, dp.elasticity, basePrice * floorMult, basePrice * ceilMult)
    const fcResult = optimizationResult?.fare_classes?.find((fc) => fc.fare_class === activeTab)
    return { curveData: data, optimalPrice: fcResult?.optimal_price ?? null }
  }, [selectedRoute, activeTab, optimizationResult])

  if (!selectedRoute) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 h-80 flex items-center justify-center text-gray-500 text-sm">
        Select a route to view revenue curves
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-gray-400 uppercase tracking-widest">Revenue vs Price Curve</div>
        <div className="flex gap-1" role="tablist" aria-label="Fare class">
          {FARE_CLASSES.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={activeTab === t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                activeTab === t.key
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={curveData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="price"
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            tickCount={6}
          />
          <YAxis
            yAxisId="revenue"
            orientation="left"
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            tickFormatter={(v) => {
              if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(0)}L`
              if (v >= 1000) return `₹${(v / 1000).toFixed(0)}k`
              return `₹${v}`
            }}
            width={55}
          />
          <YAxis
            yAxisId="demand"
            orientation="right"
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            tickFormatter={(v) => `${v} seats`}
            width={65}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '11px', color: '#9ca3af' }} />
          <Line
            yAxisId="revenue"
            type="monotone"
            dataKey="revenue"
            stroke={tab.chart}
            strokeWidth={2.5}
            dot={false}
            name="Revenue (₹)"
          />
          <Line
            yAxisId="demand"
            type="monotone"
            dataKey="demand"
            stroke="#f59e0b"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="4 2"
            name="Demand (seats)"
          />
          {optimalPrice != null && (
            <ReferenceLine
              yAxisId="revenue"
              x={Math.round(optimalPrice)}
              stroke="#22c55e"
              strokeWidth={2}
              strokeDasharray="6 3"
              label={{
                value: `Opt ₹${Math.round(optimalPrice).toLocaleString('en-IN')}`,
                fill: '#22c55e',
                fontSize: 10,
                position: 'insideTopRight',
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {optimalPrice != null && (
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
          <span className="w-4 border-t-2 border-green-500 border-dashed inline-block"></span>
          Optimal price from OR-Tools CBC MIP solver
        </div>
      )}
    </div>
  )
}

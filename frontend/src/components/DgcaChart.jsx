import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { getDgca } from '../api'

const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-2 text-xs shadow-xl">
      <div className="text-gray-400 mb-0.5">{label}</div>
      <div className="text-orange-300 font-bold">PLF {payload[0]?.value?.toFixed(1)}%</div>
    </div>
  )
}

export default function DgcaChart({ selectedRoute }) {
  const [dgcaData, setDgcaData] = useState(null)

  useEffect(() => {
    getDgca().then(res => setDgcaData(res.data)).catch(() => {})
  }, [])

  if (!dgcaData) return null

  const series = dgcaData.market_plf_series.map(d => ({
    label: `${MONTH_ABBR[d.month]} ${String(d.year).slice(2)}`,
    plf: d.plf_pct,
    year: d.year,
    month: d.month,
  }))

  // Route-specific monthly pax for selected route (last 6 months)
  const routePax = selectedRoute
    ? (dgcaData.route_monthly_pax[selectedRoute.route_id] ?? []).slice(-6)
    : []

  const routeDelta = selectedRoute
    ? (dgcaData.route_plf_deltas[selectedRoute.route_id] ?? 0)
    : 0

  const latestPlf = series[series.length - 1]?.plf ?? 0
  const routePlf  = latestPlf + routeDelta

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-widest">DGCA Market PLF Trend</div>
          <div className="text-xs text-gray-600 mt-0.5">
            Scheduled domestic · actual DGCA monthly data
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Latest market</div>
          <div className="text-lg font-bold text-orange-400">{latestPlf.toFixed(1)}%</div>
          {selectedRoute && (
            <div className="text-xs text-gray-500">
              {selectedRoute.route_id}:{' '}
              <span className="text-orange-300">{routePlf.toFixed(1)}%</span>
              <span className="text-gray-600 ml-1">
                ({routeDelta >= 0 ? '+' : ''}{routeDelta}pp)
              </span>
            </div>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="label"
            tick={{ fill: '#6b7280', fontSize: 9 }}
            tickLine={false}
            interval={2}
          />
          <YAxis
            domain={[78, 94]}
            tick={{ fill: '#6b7280', fontSize: 9 }}
            tickFormatter={v => `${v}%`}
            width={34}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={85} stroke="#374151" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="plf"
            stroke="#fb923c"
            strokeWidth={2}
            dot={{ r: 2, fill: '#fb923c' }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {routePax.length > 0 && (
        <div className="mt-3 border-t border-gray-800 pt-3">
          <div className="text-xs text-gray-500 mb-2">
            {selectedRoute.route_id} — recent monthly pax (both directions, DGCA)
          </div>
          <div className="flex gap-2 flex-wrap">
            {routePax.map(d => (
              <div key={`${d.year}-${d.month}`}
                   className="bg-gray-800 rounded-md px-2 py-1 text-xs text-center">
                <div className="text-gray-500">{MONTH_ABBR[d.month]} {String(d.year).slice(2)}</div>
                <div className="text-orange-400 font-semibold">
                  {(d.pax / 1000).toFixed(0)}k
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

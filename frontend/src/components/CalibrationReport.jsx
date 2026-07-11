import { useState } from 'react'
import { calibrate } from '../api'
import { FC_TEXT_COLOR, FC_LABEL } from '../fareClasses'
import Spinner from './Spinner'

function R2Bar({ value }) {
  const pct = Math.round(Math.max(0, Math.min(value, 1)) * 100)
  const color = pct >= 85 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-800 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs w-8 text-right text-gray-400">{value?.toFixed(3)}</span>
    </div>
  )
}

function PctChange({ value }) {
  if (value == null) return <span className="text-gray-500">—</span>
  const color = Math.abs(value) > 10 ? 'text-amber-400' : 'text-gray-400'
  const sign = value >= 0 ? '+' : ''
  return <span className={color}>{sign}{value.toFixed(1)}%</span>
}

export default function CalibrationReport({ selectedRoute }) {
  const [report, setReport] = useState(null)
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [error, setError] = useState(null)

  const runCalibration = async () => {
    setIsCalibrating(true)
    setError(null)
    try {
      const res = await calibrate(selectedRoute?.route_id ?? null)
      setReport(res.data)
    } catch {
      setError('Calibration failed — check that the backend is reachable.')
    } finally {
      setIsCalibrating(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-widest">Demand Curve Calibration</div>
          <div className="text-xs text-gray-500 mt-0.5">
            Log-log OLS on synthetic bookings anchored to real DGCA PLF — a parameter-recovery simulation study
          </div>
        </div>
        <button
          onClick={runCalibration}
          disabled={isCalibrating}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          {isCalibrating ? (
            <>
              <Spinner className="h-3 w-3" />
              Calibrating…
            </>
          ) : (
            `Run Calibration${selectedRoute ? ` · ${selectedRoute.route_id}` : ' · All Routes'}`
          )}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-400 mb-3" role="alert">{error}</div>
      )}

      {!report && !isCalibrating && !error && (
        <div className="text-center py-8 text-gray-500 text-sm border border-dashed border-gray-800 rounded-lg">
          Fits demand elasticity via log-log OLS against 90 days of DGCA-anchored synthetic bookings.
          Sold-out days are discarded as censored observations (the RM &ldquo;unconstraining&rdquo; problem).
        </div>
      )}

      {report && (
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <div className="text-gray-400 text-xs">Routes</div>
              <div className="text-white font-bold text-lg">{report.routes_calibrated}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <div className="text-gray-400 text-xs">Fare Classes</div>
              <div className="text-white font-bold text-lg">{report.total_fare_classes}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <div className="text-gray-400 text-xs">Avg R²</div>
              <div className={`font-bold text-lg ${report.avg_r_squared >= 0.80 ? 'text-green-400' : report.avg_r_squared >= 0.65 ? 'text-amber-400' : 'text-red-400'}`}>
                {report.avg_r_squared?.toFixed(3)}
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <div className="text-gray-400 text-xs">Avg RMSE (seats)</div>
              <div className="text-white font-bold text-lg">{report.avg_rmse?.toFixed(2)}</div>
            </div>
          </div>

          {/* Data provenance */}
          <div className="flex items-center gap-2 bg-orange-950/30 border border-orange-900/40 rounded-lg px-3 py-2 text-xs text-orange-300">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block shrink-0"></span>
            <span>
              Bookings are <strong>synthetic</strong>, demand levels anchored to real DGCA monthly PLF via{' '}
              <a href="https://github.com/Vonter/india-aviation-traffic" target="_blank" rel="noreferrer"
                 className="underline underline-offset-2 hover:text-orange-200">
                Vonter/india-aviation-traffic
              </a>
              . High R² shows the pipeline recovers known parameters — it is not evidence about real demand.
            </span>
          </div>

          {/* Results table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left pb-2 font-normal">Route</th>
                  <th className="text-left pb-2 font-normal">Class</th>
                  <th className="text-right pb-2 font-normal">Base Demand</th>
                  <th className="text-right pb-2 font-normal">Δ Demand</th>
                  <th className="text-right pb-2 font-normal">Elasticity</th>
                  <th className="text-right pb-2 font-normal">Δ Elast.</th>
                  <th className="pb-2 font-normal pl-3 w-32">R²</th>
                  <th className="text-right pb-2 font-normal">RMSE</th>
                  <th className="text-right pb-2 font-normal">N</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {report.results.map((r) => (
                  <tr key={`${r.route_id}-${r.fare_class}`} className="hover:bg-gray-800/30 transition-colors">
                    <td className="py-1.5 pr-2 text-gray-300">{r.route_id}</td>
                    <td className="py-1.5 pr-4">
                      <span className={FC_TEXT_COLOR[r.fare_class] ?? 'text-gray-300'}>
                        {FC_LABEL[r.fare_class] ?? r.fare_class}
                      </span>
                    </td>
                    <td className="py-1.5 text-right text-gray-400">
                      {r.current_base_demand} → <span className="text-white">{r.fitted_base_demand}</span>
                    </td>
                    <td className="py-1.5 text-right"><PctChange value={r.pct_change_base_demand} /></td>
                    <td className="py-1.5 text-right text-gray-400">
                      {r.current_elasticity} → <span className="text-white">{r.fitted_elasticity}</span>
                    </td>
                    <td className="py-1.5 text-right"><PctChange value={r.pct_change_elasticity} /></td>
                    <td className="py-1.5 pl-3 w-32"><R2Bar value={r.r_squared} /></td>
                    <td className="py-1.5 text-right text-gray-400">{r.rmse?.toFixed(2)}</td>
                    <td className="py-1.5 text-right text-gray-500">{r.n_observations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Recommendations */}
          {report.recommendations?.length > 0 && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
              <div className="text-xs text-gray-400 uppercase tracking-widest mb-2">Recommendations</div>
              <ul className="space-y-1">
                {report.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                    <span className="text-indigo-400 mt-0.5 shrink-0">›</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-xs text-gray-500">
            Calibrated at {new Date(report.calibration_timestamp).toLocaleString('en-IN')}
          </div>
        </div>
      )}
    </div>
  )
}

import { FARE_CLASSES } from '../fareClasses'
import { fmtINRShort, fmtPrice } from '../utils/format'
import Spinner from './Spinner'

const SCENARIO_STYLES = {
  off_peak: { badge: 'bg-gray-700 text-gray-300', row: '' },
  low:      { badge: 'bg-blue-900/50 text-blue-300', row: '' },
  medium:   { badge: 'bg-green-900/50 text-green-300', row: 'font-bold' },
  high:     { badge: 'bg-amber-900/50 text-amber-300', row: '' },
  peak:     { badge: 'bg-red-900/50 text-red-300', row: '' },
}

function LoadBar({ value }) {
  const pct = Math.min(Math.round(value * 100), 100)
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-800 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs w-8 text-right">{pct}%</span>
    </div>
  )
}

export default function ScenarioTable({ scenarios, loading, capacity }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 h-full">
      <div className="text-xs text-gray-400 uppercase tracking-widest mb-3">Demand Scenarios</div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
          <Spinner className="h-5 w-5 mr-2 text-indigo-500" />
          Computing scenarios…
        </div>
      ) : scenarios.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
          Select a route to view scenarios
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="text-left pb-2 font-normal">Scenario</th>
                {FARE_CLASSES.map(({ key, shortLabel }) => (
                  <th key={key} className="text-right pb-2 font-normal">{shortLabel}</th>
                ))}
                <th className="text-right pb-2 font-normal">Revenue</th>
                <th className="pb-2 font-normal pl-3">Load</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {scenarios.map((s) => {
                const styles = SCENARIO_STYLES[s.scenario] ?? SCENARIO_STYLES.medium
                return (
                  <tr key={s.scenario} className={`${styles.row} hover:bg-gray-800/40 transition-colors`}>
                    <td className="py-2 pr-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${styles.badge}`}>
                        {s.label}
                      </span>
                    </td>
                    {FARE_CLASSES.map(({ key, text }) => (
                      <td key={key} className={`py-2 text-right ${text}`}>
                        {fmtPrice(s[`${key}_price`])}
                      </td>
                    ))}
                    <td className="py-2 text-right text-gray-200">{fmtINRShort(s.total_revenue)}</td>
                    <td className="py-2 pl-3 w-28">
                      <LoadBar value={s.load_factor} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {scenarios.length > 0 && (
        <div className="mt-3 border-t border-gray-800 pt-3 grid grid-cols-2 gap-2 text-xs text-gray-500">
          <div>Capacity: <span className="text-gray-300">{capacity} seats</span></div>
          <div className="text-right">
            Peak rev:{' '}
            <span className="text-green-400">
              {fmtINRShort(scenarios.find((s) => s.scenario === 'peak')?.total_revenue ?? 0)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

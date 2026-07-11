import { useId } from 'react'
import { FARE_CLASSES } from '../fareClasses'
import { fmtPrice } from '../utils/format'

export default function RouteSelector({ routes, selectedRoute, onRouteChange }) {
  const selectId = useId()
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
      <label htmlFor={selectId} className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
        Route
      </label>
      <select
        id={selectId}
        value={selectedRoute?.route_id ?? ''}
        onChange={(e) => {
          const route = routes.find((r) => r.route_id === e.target.value)
          onRouteChange(route)
        }}
        className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none cursor-pointer"
      >
        {routes.map((r) => (
          <option key={r.route_id} value={r.route_id}>
            {r.origin.split('(')[0].trim()} → {r.destination.split('(')[0].trim()} ({r.route_id}) — {r.distance_km.toLocaleString()} km
          </option>
        ))}
      </select>

      {selectedRoute && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            {FARE_CLASSES.map(({ key, label, text }) => (
              <div key={key} className="bg-gray-800 rounded-lg p-2 text-center">
                <div className="text-gray-400">{label}</div>
                <div className={`${text} font-bold`}>{fmtPrice(selectedRoute[`base_price_${key}`])}</div>
              </div>
            ))}
          </div>
          {selectedRoute.dgca_latest_market_plf && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block shrink-0"></span>
              DGCA market PLF {selectedRoute.dgca_latest_month}:&nbsp;
              <span className="text-orange-400 font-semibold">{selectedRoute.dgca_latest_market_plf}%</span>
              {selectedRoute.dgca_route_plf_delta !== 0 && (
                <span className="text-gray-500">
                  ({selectedRoute.dgca_route_plf_delta > 0 ? '+' : ''}{selectedRoute.dgca_route_plf_delta}pp route adj.)
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

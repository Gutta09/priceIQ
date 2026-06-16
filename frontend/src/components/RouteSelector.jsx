export default function RouteSelector({ routes, selectedRoute, onRouteChange }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
      <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
        Route
      </label>
      <select
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
            <div className="bg-gray-800 rounded-lg p-2 text-center">
              <div className="text-gray-400">Economy</div>
              <div className="text-green-400 font-bold">₹{selectedRoute.base_price_economy.toLocaleString('en-IN')}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2 text-center">
              <div className="text-gray-400">Business</div>
              <div className="text-blue-400 font-bold">₹{selectedRoute.base_price_business.toLocaleString('en-IN')}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2 text-center">
              <div className="text-gray-400">First / Flex</div>
              <div className="text-purple-400 font-bold">₹{selectedRoute.base_price_first.toLocaleString('en-IN')}</div>
            </div>
          </div>
          {selectedRoute.dgca_latest_market_plf && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block shrink-0"></span>
              DGCA market PLF {selectedRoute.dgca_latest_month}:&nbsp;
              <span className="text-orange-400 font-semibold">{selectedRoute.dgca_latest_market_plf}%</span>
              {selectedRoute.dgca_route_plf_delta !== 0 && (
                <span className="text-gray-600">
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

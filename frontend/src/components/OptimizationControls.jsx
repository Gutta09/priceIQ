import { useId } from 'react'
import { FARE_CLASSES } from '../fareClasses'
import Spinner from './Spinner'

function Slider({ label, value, min, max, step, onChange, format }) {
  const id = useId()
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <label htmlFor={id} className="text-gray-400">{label}</label>
        <span className="text-indigo-400 font-bold">{format ? format(value) : value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-lg appearance-none bg-gray-700 cursor-pointer"
      />
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>{format ? format(min) : min}</span>
        <span>{format ? format(max) : max}</span>
      </div>
    </div>
  )
}

function ElasticityInput({ label, value, onChange }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-gray-400 mb-1">{label}</label>
      <input
        id={id}
        type="number"
        min="0.1"
        max="5.0"
        step="0.05"
        value={value ?? ''}
        placeholder="auto"
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-gray-500"
      />
    </div>
  )
}

export default function OptimizationControls({
  capacity,
  setCapacity,
  demandMultiplier,
  setDemandMultiplier,
  elasticityOverride,
  setElasticityOverride,
  onOptimize,
  isOptimizing,
  selectedRoute,
}) {
  const maxCap = selectedRoute ? Math.max(400, selectedRoute.total_capacity + 50) : 400

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-4">
      <div className="text-xs text-gray-400 uppercase tracking-widest">Optimization Controls</div>

      <Slider
        label="Seat Capacity"
        value={capacity}
        min={50}
        max={maxCap}
        step={5}
        onChange={setCapacity}
        format={(v) => `${v} seats`}
      />

      <Slider
        label="Demand Multiplier"
        value={demandMultiplier}
        min={0.3}
        max={2.0}
        step={0.05}
        onChange={setDemandMultiplier}
        format={(v) => `${v.toFixed(2)}×`}
      />

      <div>
        <div className="text-xs text-gray-400 mb-2">
          Elasticity Overrides
          <span className="text-gray-500 normal-case">
            {' '}— how sharply demand falls as price rises (higher = more price-sensitive)
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {FARE_CLASSES.map(({ key, label }) => (
            <ElasticityInput
              key={key}
              label={label}
              value={elasticityOverride[key]}
              onChange={(v) => setElasticityOverride((p) => ({ ...p, [key]: v }))}
            />
          ))}
        </div>
      </div>

      <button
        onClick={onOptimize}
        disabled={isOptimizing || !selectedRoute}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
      >
        {isOptimizing ? (
          <>
            <Spinner />
            Solving MIP…
          </>
        ) : (
          'Run Optimization'
        )}
      </button>
    </div>
  )
}

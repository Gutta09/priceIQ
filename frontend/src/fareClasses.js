// Single source of truth for fare-class display metadata.
// Keys must match the backend's FARE_CLASSES ("economy", "premium", "business").
export const FARE_CLASSES = [
  { key: 'economy',  label: 'Economy',      shortLabel: 'Eco',  text: 'text-green-400',  chart: '#6ee7b7' },
  { key: 'premium',  label: 'Prem Economy', shortLabel: 'Prem', text: 'text-blue-400',   chart: '#93c5fd' },
  { key: 'business', label: 'Business',     shortLabel: 'Biz',  text: 'text-purple-400', chart: '#d8b4fe' },
]

export const FC_TEXT_COLOR = Object.fromEntries(FARE_CLASSES.map(fc => [fc.key, fc.text]))
export const FC_LABEL = Object.fromEntries(FARE_CLASSES.map(fc => [fc.key, fc.label]))

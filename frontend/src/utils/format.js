// Indian-notation currency formatting (lakh = 1,00,000 · crore = 1,00,00,000)

const CRORE = 1_00_00_000
const LAKH = 1_00_000

export function fmtINR(n, { dash = false } = {}) {
  if (n == null) return dash ? '—' : '₹0'
  if (n >= CRORE) return `₹${(n / CRORE).toFixed(2)} Cr`
  if (n >= LAKH) return `₹${(n / LAKH).toFixed(2)} L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

export function fmtINRShort(n) {
  if (n == null) return '—'
  if (n >= CRORE) return `₹${(n / CRORE).toFixed(1)}Cr`
  if (n >= LAKH) return `₹${(n / LAKH).toFixed(1)}L`
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}k`
  return `₹${Math.round(n)}`
}

export function fmtPrice(n) {
  if (n == null) return '—'
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

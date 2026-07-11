import axios from 'axios'

// In production FastAPI serves the React app at the same origin — no /api prefix needed.
const BASE = import.meta.env.PROD ? '' : '/api'

const api = axios.create({
  baseURL: BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

export const getRoutes = () => api.get('/routes')

export const optimize = (payload, signal) => api.post('/optimize', payload, { signal })

export const calibrate = (routeId, signal) =>
  api.post('/calibrate', null, { params: routeId ? { route_id: routeId } : {}, signal })

export const getScenarios = (routeId, capacity, signal) =>
  api.get('/scenarios', {
    params: { route_id: routeId, ...(capacity != null ? { total_capacity: capacity } : {}) },
    signal,
  })

export const getDgca = (signal) => api.get('/dgca', { signal })

export const getMetrics = (routeId, signal) => api.get(`/metrics/${routeId}`, { signal })

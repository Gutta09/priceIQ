import axios from 'axios'

// In production FastAPI serves the React app at the same origin — no /api prefix needed.
const BASE = import.meta.env.PROD ? '' : '/api'

const api = axios.create({
  baseURL: BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

export const getRoutes = () => api.get('/routes')

export const optimize = (payload) => api.post('/optimize', payload)

export const calibrate = (routeId) =>
  api.post('/calibrate', null, { params: routeId ? { route_id: routeId } : {} })

export const getScenarios = (routeId, capacity) =>
  api.get('/scenarios', {
    params: { route_id: routeId, ...(capacity != null ? { total_capacity: capacity } : {}) },
  })

export const getDgca = () => api.get('/dgca')

export const getMetrics = (routeId) => api.get(`/metrics/${routeId}`)

import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://your-server.com'

export const api = axios.create({
  baseURL: BASE_URL
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('technicianToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      localStorage.removeItem('technicianToken')
      localStorage.removeItem('technicianId')
      if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/signup')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export function extractMessage(err, fallback = 'Something went wrong') {
  const data = err?.response?.data
  const msg =
    data?.message ||
    data?.error ||
    data?.msg ||
    (typeof data === 'string' ? data : null)
  return msg || fallback
}

export default BASE_URL

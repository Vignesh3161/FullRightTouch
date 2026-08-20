export function getToken() {
  return localStorage.getItem('technicianToken')
}

export function setToken(token) {
  if (token) localStorage.setItem('technicianToken', token)
}

export function getTechnicianId() {
  return localStorage.getItem('technicianId')
}

export function setTechnicianId(id) {
  if (id) localStorage.setItem('technicianId', id)
}

export function clearAuth() {
  localStorage.removeItem('technicianToken')
  localStorage.removeItem('technicianId')
}

export function extractResult(data) {
  if (!data) return null
  if (data.result) return data.result
  if (data.data) return data.data
  if (data.technician) return data.technician
  return data
}

export function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatCurrency(value) {
  const num = Number(value)
  if (isNaN(num)) return '₹0'
  return `₹${num.toLocaleString('en-IN')}`
}

export function toText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    return toText(value.name || value.serviceName || value.title || value.label || value._id || '')
  }
  return ''
}

export function skillLabel(skill) {
  if (!skill || typeof skill !== 'object') return toText(skill)
  if (skill.serviceName || skill.name || skill.serviceId) {
    return toText(skill.serviceName || skill.name || skill.serviceId)
  }
  return toText(skill._id)
}

export function skillId(skill) {
  if (!skill) return ''
  const id = typeof skill.serviceId === 'string' ? skill.serviceId : skill._id
  if (typeof id === 'string') return id
  if (typeof id === 'object') return toText(id._id || id.serviceId)
  return toText(skill.serviceId)
}

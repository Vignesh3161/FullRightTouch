import { api } from './client'

// ---------- 1. Auth ----------
export const sendSignupOtp = (identifier, termsAndServices, privacyPolicy) =>
  api.post('/api/technician/signup/technician', { identifier, termsAndServices, privacyPolicy })

export const verifySignupOtp = (identifier, otp) =>
  api.post('/api/technician/signup/technician/verify-otp', { identifier, otp })

export const requestLoginOtp = (identifier) =>
  api.post('/api/technician/login/technician', { identifier })

export const verifyLoginOtp = (identifier, otp) =>
  api.post('/api/technician/login/technician/verify-otp', { identifier, otp, role: 'Technician' })

// ---------- 2. Profile & Location ----------
export const createTechnicianProfile = (data) => api.post('/api/technician/technicianData', data)
export const getMyProfile = () => api.get('/api/technician/technician/me')
export const getTechnicianById = (id) => api.get(`/api/technician/technicianById/${id}`)
export const getTechnicianAll = () => api.get('/api/technician/technicianAll')
export const updateTechnician = (data) => api.put('/api/technician/updateTechnician', data)
export const updateAvailability = (isOnline) =>
  api.put('/api/technician/updateTechnician', { availability: { isOnline } })
export const addSkills = (serviceIds, experienceYears) =>
  api.put('/api/technician/technician/skills/add', { serviceIds, experienceYears })
export const removeSkills = (serviceIds) => api.put('/api/technician/technician/skills/remove', { serviceIds })
export const updateTraining = (technicianId, trainingCompleted) =>
  api.put(`/api/technician/${technicianId}/training`, { trainingCompleted })
export const uploadProfileImage = (formData) =>
  api.post('/api/technician/technician/profile-image', formData)
export const updateLiveLocation = (latitude, longitude) =>
  api.put('/api/technician/location', { latitude, longitude })
export const updateFcmToken = (token, unregister = false) =>
  api.put('/api/technician/fcm-token', { token, unregister })

// ---------- 3. KYC & Bank ----------
export const submitKyc = (data) => api.post('/api/technician/technician/kyc', data)
export const uploadKycDocuments = (formData) =>
  api.post('/api/technician/technician/kyc/upload', formData)
export const submitBankDetails = (data) => api.post('/api/technician/technician/banks', data)
export const getKycStatus = () => api.get('/api/technician/technician/kyc/me')
export const getKycById = (id) => api.get(`/api/technician/technician/kyc/${id}`)
export const getKycFullById = (id) => api.get(`/api/technician/technician/kyc/${id}/full`)
export const getAllKyc = () => api.get('/api/technician/technician/kyc')
export const getMyAccount = () => api.get('/api/user/me')
export const updateMyAccount = (data) => api.put('/api/user/me', data)

// ---------- 4. Jobs & Job Status ----------
export const getBroadcastedJobs = (page = 1, limit = 20) =>
  api.get(`/api/technician/job-broadcast/my-jobs?page=${page}&limit=${limit}`)
export const respondToJob = (bookingId, status) =>
  api.put(`/api/technician/job-broadcast/respond/${bookingId}`, { status })
export const getCurrentJobs = () => api.get('/api/technician/jobs/current')
export const getAcceptedJobs = (page = 1, limit = 20) =>
  api.get(`/api/technician/jobs/accepted?page=${page}&limit=${limit}`)
export const getAcceptedScheduledJobs = (page = 1, limit = 20) =>
  api.get(`/api/technician/jobs/accepted/scheduled?page=${page}&limit=${limit}`)
export const getJobHistory = (page = 1, limit = 20) =>
  api.get(`/api/technician/jobs/history?page=${page}&limit=${limit}`)
export const updateJobStatus = (bookingId, status) =>
  api.put(`/api/technician/status/${bookingId}`, { status })
export const uploadWorkImages = (bookingId, formData) =>
  api.post(`/api/technician/jobs/${bookingId}/work-images`, formData)
export const cancelBooking = (bookingId, reason) =>
  api.put(`/api/technician/booking/technician/cancel/${bookingId}`, { reason })
export const reacceptCancelledJob = (bookingId, withPenalty = false) =>
  api.put(`/api/technician/booking/reaccept/${bookingId}`, { withPenalty })

// ---------- 5. Zone ----------
export const getMyZone = () => api.get('/api/technician/zone/me')
export const getZoneServices = () => api.get('/api/technician/zone/services')

// ---------- 6. Wallet ----------
export const getWalletBalance = () => api.get('/api/technician/wallet')
export const getWalletTransactions = (page = 1, limit = 20, startDate, endDate) => {
  const params = new URLSearchParams({ page, limit })
  if (startDate) params.append('startDate', startDate)
  if (endDate) params.append('endDate', endDate)
  return api.get(`/api/technician/wallet/transactions?${params.toString()}`)
}
export const getWalletHistory = (page = 1, limit = 20, startDate, endDate) => {
  const params = new URLSearchParams({ page, limit })
  if (startDate) params.append('startDate', startDate)
  if (endDate) params.append('endDate', endDate)
  return api.get(`/api/technician/wallet/history?${params.toString()}`)
}
export const updatePayoutSettings = (data) =>
  api.put('/api/technician/wallet/payout-settings', data)
export const requestWithdrawal = (amount) =>
  api.post('/api/technician/wallet/withdrawal', { amount })
export const requestWithdrawalAlt = (amount) =>
  api.post('/api/technician/wallet/withdrawal/request', { amount })
export const getWithdrawalHistory = () => api.get('/api/technician/wallet/withdrawalhistory/me')
export const getWithdrawalHistoryAlt = () => api.get('/api/technician/wallet/withdrawalhistory')
export const cancelWithdrawal = (withdrawalId) =>
  api.put(`/api/technician/wallet/withdrawal/${withdrawalId}/cancel`)

// ---------- 7. Finance & Earnings ----------
export const getEarningsSummary = () => api.get('/api/technician/finance/earnings')

// ---------- 8. Services ----------
export const getAllServices = (params = {}) => {
  const searchParams = new URLSearchParams()
  if (params.search) searchParams.append('search', params.search)
  if (params.category) searchParams.append('category', params.category)
  if (params.page) searchParams.append('page', params.page)
  if (params.limit) searchParams.append('limit', params.limit)
  return api.get(`/api/user/getAllServices?${searchParams.toString()}`)
}

export const getServiceById = (id) => api.get(`/api/user/getAllServices/${id}`)

// ---------- 9. Admin: Operational Cities ----------
export const getOperationalCities = () => api.get('/api/admin/operational-cities')
export const getActiveCity = () => api.get('/api/admin/operational-cities/active')
export const getPolygons = () => api.get('/api/admin/operational-cities/polygons')
export const createCity = (data) => api.post('/api/admin/operational-cities', data)
export const updateCity = (id, data) => api.put(`/api/admin/operational-cities/${id}`, data)
export const activateCity = (id) => api.post(`/api/admin/operational-cities/${id}/activate`)
export const deleteCity = (id) => api.delete(`/api/admin/operational-cities/${id}`)
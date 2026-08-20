import { createContext, useContext, useEffect, useState } from 'react'
import { getMyProfile } from '../api/endpoints'
import { extractResult, getTechnicianId, getToken, setTechnicianId, setToken, clearAuth } from '../utils/helpers'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(getToken())
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)

  const login = (newToken) => {
    setToken(newToken)
    setTokenState(newToken)
  }

  const logout = () => {
    clearAuth()
    setTokenState(null)
    setProfile(null)
  }

  useEffect(() => {
    if (!getToken()) return
    setLoading(true)
    getMyProfile()
      .then((res) => {
        const p = extractResult(res.data)
        setProfile(p)
        if (p?._id) setTechnicianId(p._id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  return (
    <AuthContext.Provider value={{ token, profile, setProfile, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

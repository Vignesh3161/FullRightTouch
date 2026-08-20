import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import {
  connectSocket,
  disconnectSocket,
  getSocket,
  isDuplicate,
  getLatestVersion,
  setLatestVersion,
  clearBroadcastCache
} from '../socket/client'
import { getToken, toText } from '../utils/helpers'
import useCurrentLocation from '../utils/useCurrentLocation'
import { useAuth } from './AuthContext'

const SocketContext = createContext(null)

const LOCATION_INTERVAL_MS = 5000
const JOBS_POLL_INTERVAL_MS = 10000

export function SocketProvider({ children }) {
  const { token, profile, logout } = useAuth()
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [socketError, setSocketError] = useState('')
  const [liveJobs, setLiveJobs] = useState([])
  const [incomingJob, setIncomingJob] = useState(null)
  const [locationAck, setLocationAck] = useState(null)
  const [tracking, setTracking] = useState(true)
  const [sessionMessage, setSessionMessage] = useState('')
  const [reminders, setReminders] = useState([])
  const [paymentReceived, setPaymentReceived] = useState(null)
  const { getLocation } = useCurrentLocation()
  const lastCoordsRef = useRef(null)
  const trackingRef = useRef(true)
  const sendLocationRef = useRef(null)
  const jobsPollRef = useRef(null)

  useEffect(() => {
    trackingRef.current = tracking
  }, [tracking])

  useEffect(() => {
    if (profile) {
      lastCoordsRef.current = {
        latitude: profile.latitude ?? profile.location?.latitude ?? null,
        longitude: profile.longitude ?? profile.location?.longitude ?? null
      }
    }
  }, [profile])

  const sendLocation = useCallback(async (sk) => {
    const target = sk || getSocket()
    if (!target?.connected) return
    let coords = null
    try {
      const loc = await getLocation()
      coords = { latitude: Number(loc.latitude), longitude: Number(loc.longitude) }
    } catch {
      coords = lastCoordsRef.current?.latitude != null ? lastCoordsRef.current : null
    }
    if (!coords) return
    lastCoordsRef.current = coords
    target.emit('technician:location_update', coords, (res) => {
      setLocationAck(res || { success: false, message: 'No ack from server' })
      if (res?.success && res.jobsFound > 0) {
        fetchJobs(target)
      }
    })
  }, [getLocation])

  useEffect(() => {
    sendLocationRef.current = sendLocation
  }, [sendLocation])

  const fetchJobs = useCallback((sk, since) => {
    const target = sk || getSocket()
    if (!target?.connected) return
    const cursor = since !== undefined ? since : getLatestVersion()
    target.emit('technician:get_jobs', { since: cursor }, (ack) => {
      if (!ack) return
      if (ack.throttled) {
        setTimeout(() => fetchJobs(target, cursor), ack.retryAfterMs || 3000)
        return
      }
      if (ack.success && ack.latestVersion) {
        setLatestVersion(ack.latestVersion)
      }
    })
  }, [])

  const requestJobs = useCallback(() => {
    fetchJobs(getSocket())
  }, [fetchJobs])

  useEffect(() => {
    if (!getToken()) {
      disconnectSocket()
      setSocket(null)
      setConnected(false)
      setLiveJobs([])
      setIncomingJob(null)
      clearBroadcastCache()
      return
    }

    const sk = connectSocket(
      (reason) => {
        setSessionMessage(`Session revoked: ${reason}`)
        logout()
      },
      (msg) => {
        setSessionMessage(msg)
        logout()
      }
    )
    setSocket(sk)

    sk.on('connect', () => {
      setConnected(true)
      setSocketError('')
      fetchJobs(sk)
      sendLocationRef.current?.(sk)
    })

    sk.on('disconnect', (reason) => {
      setConnected(false)
      if (reason === 'io server disconnect') {
        setSocketError('Disconnected by server')
      }
    })

    sk.on('connect_error', (err) => {
      setConnected(false)
      setSocketError(err?.message || 'Socket connection error')
    })

    sk.on('technician:jobs_list', (jobs) => {
      if (Array.isArray(jobs)) {
        setLiveJobs(jobs)
        if (jobs.length > 0 && jobs[0].version) {
          setLatestVersion(jobs[0].version)
        }
      }
    })

    sk.on('job:new', (data, ack) => {
      if (typeof ack === 'function') ack()
      if (isDuplicate(data)) return
      setIncomingJob(data)
    })

    sk.on('job:notified', (data, ack) => {
      if (typeof ack === 'function') ack()
      if (isDuplicate(data)) return
      setIncomingJob(data)
    })

    sk.on('job_taken', (data) => {
      const id = toText(data?.bookingId)
      if (!id) return
      setLiveJobs((prev) => prev.filter((j) => toText(j.bookingId || j._id) !== id))
      setIncomingJob((prev) => (prev && toText(prev.bookingId) === id ? null : prev))
    })

    sk.on('booking:reminder', (data) => {
      setReminders((prev) => [...prev, { ...data, id: Date.now() }])
      setTimeout(() => {
        setReminders((prev) => prev.filter((r) => r.id !== data?.id))
      }, 10000)
    })

    sk.on('booking:travel_reminder', (data) => {
      setReminders((prev) => [
        ...prev,
        { ...data, type: 'TRAVEL_CTA', id: Date.now() }
      ])
    })

    sk.on('payment_received', (data) => {
      setPaymentReceived(data)
      setTimeout(() => setPaymentReceived(null), 10000)
    })

    return () => {
      sk.off('connect')
      sk.off('disconnect')
      sk.off('connect_error')
      sk.off('technician:jobs_list')
      sk.off('job:new')
      sk.off('job:notified')
      sk.off('job_taken')
      sk.off('booking:reminder')
      sk.off('booking:travel_reminder')
      sk.off('payment_received')
      sk.off('session:revoked')
      sk.off('session:replaced')
    }
  }, [token, fetchJobs, logout])

  useEffect(() => {
    if (!connected) {
      if (jobsPollRef.current) clearInterval(jobsPollRef.current)
      return
    }
    jobsPollRef.current = setInterval(() => {
      fetchJobs()
    }, JOBS_POLL_INTERVAL_MS)
    return () => {
      if (jobsPollRef.current) clearInterval(jobsPollRef.current)
    }
  }, [connected, fetchJobs])

  useEffect(() => {
    if (!connected) return
    const iv = setInterval(() => {
      if (trackingRef.current) sendLocationRef.current?.()
    }, LOCATION_INTERVAL_MS)
    return () => clearInterval(iv)
  }, [connected])

  return (
    <SocketContext.Provider
      value={{
        socket,
        connected,
        socketError,
        liveJobs,
        setLiveJobs,
        incomingJob,
        setIncomingJob,
        locationAck,
        tracking,
        setTracking,
        requestJobs,
        sendLocation,
        sessionMessage,
        setSessionMessage,
        reminders,
        setReminders,
        paymentReceived,
        setPaymentReceived,
        latestVersion: getLatestVersion()
      }}
    >
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  return useContext(SocketContext)
}

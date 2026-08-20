import { io } from 'socket.io-client'
import { getToken } from '../utils/helpers'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://your-server.com'

let socket = null

const broadcastCache = new Map()
let latestVersion = 0

export function connectSocket(onSessionRevoked, onSessionReplaced) {
  const token = getToken()
  if (socket) socket.disconnect()

  socket = io(BASE_URL, {
    auth: { token },
    connectionStateRecovery: {
      maxDisconnectionDuration: 120000
    },
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    timeout: 10000,
    upgrade: true,
    rememberUpgrade: true,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {}
    }
  })

  socket.on('session:revoked', (data) => {
    if (onSessionRevoked) onSessionRevoked(data?.reason || 'Session revoked')
    socket.disconnect()
  })

  socket.on('session:replaced', (data) => {
    if (onSessionReplaced) onSessionReplaced(data?.message || 'Another device connected')
    socket.disconnect()
  })

  return socket
}

export function getSocket() {
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export function isDuplicate(job) {
  if (!job?.broadcastId) return false
  const existing = broadcastCache.get(job.broadcastId)
  if (existing && existing >= job.version) return true
  broadcastCache.set(job.broadcastId, job.version)
  if (job.version > latestVersion) latestVersion = job.version
  return false
}

export function getLatestVersion() {
  return latestVersion
}

export function setLatestVersion(v) {
  if (v && v > latestVersion) latestVersion = v
}

export function clearBroadcastCache() {
  broadcastCache.clear()
  latestVersion = 0
}

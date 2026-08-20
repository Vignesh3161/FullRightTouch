import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getCurrentJobs,
  getWalletBalance,
  getKycStatus,
  getMyProfile,
  updateLiveLocation
} from '../api/endpoints'
import { extractResult, formatCurrency, formatDate, toText } from '../utils/helpers'
import { extractMessage } from '../api/client'
import useCurrentLocation from '../utils/useCurrentLocation'
import { useSocket } from '../context/SocketContext'
import Card from '../components/Card'
import Badge from '../components/Badge'
import Alert from '../components/Alert'
import Button from '../components/Button'

export default function Dashboard() {
  const { profile, setProfile } = useAuth()
  const { connected, socketError, liveJobs, locationAck, tracking, setTracking, sendLocation, incomingJob, reminders, paymentReceived } = useSocket()
  const [currentJobs, setCurrentJobs] = useState([])
  const [wallet, setWallet] = useState(null)
  const [kyc, setKyc] = useState(null)
  const [error, setError] = useState('')
  const [locMessage, setLocMessage] = useState('')
  const { coords, setCoords, locating, locationError, setLocationError, getLocation } = useCurrentLocation()

  useEffect(() => {
    const load = async () => {
      try {
        const [jobsRes, walletRes, kycRes, meRes] = await Promise.all([
          getCurrentJobs(),
          getWalletBalance(),
          getKycStatus(),
          getMyProfile()
        ])
        setCurrentJobs(extractResult(jobsRes.data) || [])
        setWallet(extractResult(walletRes.data))
        setKyc(extractResult(kycRes.data))
        const p = extractResult(meRes.data)
        if (p) setProfile(p)
      } catch (err) {
        setError(extractMessage(err, 'Could not load dashboard'))
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (profile) {
      setCoords({
        latitude: profile.latitude ?? profile.location?.latitude ?? '',
        longitude: profile.longitude ?? profile.location?.longitude ?? ''
      })
    }
  }, [profile])

  // Auto-get location on mount
  useEffect(() => {
    const initLocation = async () => {
      try {
        const loc = await getLocation()
        await updateLiveLocation(Number(loc.latitude), Number(loc.longitude))
        setLocMessage(`Location sent: ${loc.latitude}, ${loc.longitude}`)
        setProfile({ ...profile, latitude: loc.latitude, longitude: loc.longitude })
        sendLocation()
      } catch (err) {
        // Silently fail - user can manually click button
        console.log('Auto-location failed:', err.message)
      }
    }
    initLocation()
  }, [])

  const getMyLocation = async () => {
    setError('')
    setLocMessage('')
    setLocationError('')
    try {
      const loc = await getLocation()
      await updateLiveLocation(Number(loc.latitude), Number(loc.longitude))
      setLocMessage(`Location sent: ${loc.latitude}, ${loc.longitude}`)
      setProfile({ ...profile, latitude: loc.latitude, longitude: loc.longitude })
      sendLocation()
    } catch (err) {
      setError(extractMessage(err, 'Could not update location'))
    }
  }

  const stats = [
    { label: 'Live Jobs', value: connected ? liveJobs.length : '-' },
    { label: 'Current Jobs', value: Array.isArray(currentJobs) ? currentJobs.length : '-' },
    { label: 'Wallet Balance', value: wallet ? formatCurrency(wallet.balance ?? wallet.amount ?? 0) : '-' },
    { label: 'Availability', value: profile?.availability?.isOnline ? 'Online' : 'Offline' },
    { label: 'KYC Status', value: kyc?.status || profile?.kycStatus || '-' }
  ]

  return (
    <div>
      <h2>Dashboard</h2>
      <Alert type="error">{error}</Alert>

      {reminders.length > 0 && (
        <div className="reminders-container">
          {reminders.slice(-3).map((r) => (
            <Alert key={r.id} type={r.type === 'min15' ? 'error' : 'info'}>
              {r.message || `Reminder: ${toText(r.bookingId)}`}
            </Alert>
          ))}
        </div>
      )}

      {paymentReceived && (
        <Alert type="success">
          Payment of {formatCurrency(paymentReceived.amount)} received for booking {toText(paymentReceived.bookingId)}
        </Alert>
      )}

      {incomingJob && (
        <Alert type="info">
          New job: {toText(incomingJob.serviceName)} — {toText(incomingJob.customerName)} — Go to Jobs page to accept
        </Alert>
      )}

      <div className="grid">
        {stats.map((s) => (
          <div key={s.label} className="stat">
            <small>{s.label}</small>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <Card title="My Details">
          {profile ? (
            <table className="table">
              <tbody>
                <tr>
                  <td>Name</td>
                  <td>{`${toText(profile.fname)} ${toText(profile.lname)}`.trim() || '-'}</td>
                </tr>
                <tr>
                  <td>Mobile</td>
                  <td>{toText(profile.mobile || profile.phone) || '-'}</td>
                </tr>
                <tr>
                  <td>City</td>
                  <td>{toText(profile.city) || '-'}</td>
                </tr>
                <tr>
                  <td>Locality</td>
                  <td>{toText(profile.locality) || '-'}</td>
                </tr>
                <tr>
                  <td>Experience</td>
                  <td>{profile.experienceYears ? `${toText(profile.experienceYears)} years` : '-'}</td>
                </tr>
                <tr>
                  <td>Work Status</td>
                  <td><Badge status={profile.workStatus} /></td>
                </tr>
                <tr>
                  <td>Availability</td>
                  <td>{profile.availability?.isOnline ? 'Online' : 'Offline'}</td>
                </tr>
                <tr>
                  <td>Training</td>
                  <td>{profile.trainingCompleted ? 'Completed' : 'Pending'}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="muted">Profile not found. Complete it from the Profile page.</p>
          )}
        </Card>

        <Card title="Current Jobs">
          {currentJobs.length === 0 ? (
            <p className="muted">No current jobs.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Booking</th>
                  <th>Service</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {currentJobs.map((job, i) => (
                  <tr key={toText(job._id || job.bookingId || job.id) || `job-${i}`}>
                    <td>{toText(job._id || job.bookingId || job.id) || '-'}</td>
                    <td>{toText(job.serviceName || job.service?.name) || '-'}</td>
                    <td><Badge status={job.status || job.bookingStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Live Location">
          <p className="muted" style={{ marginBottom: 10 }}>
            {coords.latitude && coords.longitude
              ? `Current: ${coords.latitude}, ${coords.longitude}`
              : 'No location saved yet.'}
          </p>
          <div className="row">
            <Button type="button" loading={locating} onClick={getMyLocation}>
              Get My Location
            </Button>
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={tracking}
                onChange={(e) => setTracking(e.target.checked)}
              />
              Auto-send live location every 5s
            </label>
          </div>
          {locMessage && <Alert type="success">{locMessage}</Alert>}
          {locationError && <Alert type="error">{locationError}</Alert>}
          {!connected && <Alert type="error">{socketError || 'Socket not connected'}</Alert>}
          {connected && locationAck && (
            <Alert type={locationAck.success ? 'info' : 'error'}>
              Socket: {locationAck.success
                ? `OK${locationAck.jobsFound > 0 ? ` — ${locationAck.jobsFound} job(s) nearby` : ''}`
                : locationAck.message || 'Failed'}
              {locationAck.throttled ? ' (throttled)' : ''}
            </Alert>
          )}
        </Card>

        <Card title="Quick Actions">
          <div className="quick-actions">
            <a href="/jobs" className="btn" style={{ width: '100%', marginBottom: 8 }}>
              View Jobs ({liveJobs.length} live)
            </a>
            <a href="/services" className="btn" style={{ width: '100%', marginBottom: 8 }}>
              Browse Services
            </a>
            <a href="/profile" className="btn btn-outline" style={{ width: '100%', marginBottom: 8 }}>
              Edit Profile
            </a>
            <a href="/kyc" className="btn btn-outline" style={{ width: '100%', marginBottom: 8 }}>
              KYC & Bank
            </a>
            <a href="/wallet" className="btn btn-outline" style={{ width: '100%' }}>
              Wallet ({wallet ? formatCurrency(wallet.balance ?? wallet.amount ?? 0) : '-'})
            </a>
          </div>
        </Card>
      </div>
    </div>
  )
}

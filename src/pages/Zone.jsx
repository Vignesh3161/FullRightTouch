import { useEffect, useState } from 'react'
import { getMyZone, getZoneServices } from '../api/endpoints'
import { extractResult, formatCurrency, formatDate, toText } from '../utils/helpers'
import { extractMessage } from '../api/client'
import Card from '../components/Card'
import Badge from '../components/Badge'
import Alert from '../components/Alert'
import Button from '../components/Button'

export default function Zone() {
  const [zone, setZone] = useState(null)
  const [mismatch, setMismatch] = useState(false)
  const [mismatchSince, setMismatchSince] = useState(null)
  const [zoneMessage, setZoneMessage] = useState('')
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [zoneRes, servicesRes] = await Promise.all([
        getMyZone(),
        getZoneServices()
      ])
      const z = extractResult(zoneRes.data)
      setZone(z?.zone || null)
      setMismatch(!!z?.mismatch)
      setMismatchSince(z?.mismatchSince || null)
      setZoneMessage(z?.message || '')
      const s = extractResult(servicesRes.data)
      setServices(Array.isArray(s) ? s : s?.services || [])
    } catch (err) {
      setError(extractMessage(err, 'Could not load zone details'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div>
      <h2>My Zone</h2>
      <Alert type="error">{error}</Alert>
      {zoneMessage && <Alert type="info">{zoneMessage}</Alert>}

      {mismatch && (
        <Alert type="error">
          You are outside your assigned zone{toText(mismatchSince) ? ` since ${formatDate(mismatchSince)}` : ''}. Update your location to get matched to local jobs.
        </Alert>
      )}

      <div className="grid-2">
        <Card title="Assigned Zone">
          {loading ? (
            <p className="muted">Loading zone...</p>
          ) : zone ? (
            <table className="table">
              <tbody>
                <tr>
                  <td>Zone Name</td>
                  <td>{toText(zone.name) || '-'}</td>
                </tr>
                <tr>
                  <td>Zone Code</td>
                  <td>{toText(zone.zoneCode) || '-'}</td>
                </tr>
                <tr>
                  <td>Operational City</td>
                  <td>{toText(zone.operationalCity?.name) || '-'}</td>
                </tr>
                <tr>
                  <td>Zone ID</td>
                  <td>{toText(zone._id) || '-'}</td>
                </tr>
                <tr>
                  <td>Location Match</td>
                  <td><Badge status={mismatch ? 'unavailable' : 'available'} /></td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="muted">No zone assigned yet.</p>
          )}
          <div style={{ marginTop: 12 }}>
            <Button className="btn-outline" onClick={load} disabled={loading}>
              Refresh
            </Button>
          </div>
        </Card>

        <Card title="Services in My Zone">
          {loading ? (
            <p className="muted">Loading services...</p>
          ) : services.length === 0 ? (
            <p className="muted">No services available in your zone.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Type</th>
                  <th>Cost</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={toText(s._id || s.id)}>
                    <td>{toText(s.serviceName || s.name) || '-'}</td>
                    <td>{toText(s.serviceType) || '-'}</td>
                    <td>{s.serviceCost != null ? formatCurrency(s.serviceCost) : '-'}</td>
                    <td>{s.duration != null ? `${toText(s.duration)} min` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  )
}

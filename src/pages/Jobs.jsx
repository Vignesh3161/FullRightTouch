import { useEffect, useRef, useState } from 'react'
import {
  getBroadcastedJobs,
  respondToJob,
  getCurrentJobs,
  getAcceptedJobs,
  getAcceptedScheduledJobs,
  updateJobStatus,
  uploadWorkImages,
  getJobHistory,
  cancelBooking,
  reacceptCancelledJob
} from '../api/endpoints'
import { extractResult, formatCurrency, formatDate, toText } from '../utils/helpers'
import { extractMessage } from '../api/client'
import { useSocket } from '../context/SocketContext'
import Card from '../components/Card'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Alert from '../components/Alert'

const STATUS_FLOW = [
  { key: 'accepted', label: 'Accepted', icon: '���' },
  { key: 'on_the_way', label: 'On The Way', icon: '����' },
  { key: 'reached', label: 'Reached', icon: '����' },
  { key: 'in_progress', label: 'In Progress', icon: '����' },
  { key: 'completed', label: 'Completed', icon: '���' }
]

const LEGACY_STATUS_MAP = {
  ACCEPTED: 'accepted',
  SEARCHING: 'broadcasted',
  requested: 'pending',
  scheduled: 'schedule'
}

function normalizeStatus(value) {
  const s = toText(value)
  if (!s) return ''
  return LEGACY_STATUS_MAP[s] || s
}

function getNextStatus(current) {
  const idx = STATUS_FLOW.findIndex((s) => s.key === normalizeStatus(current))
  if (idx >= 0 && idx < STATUS_FLOW.length - 1) return STATUS_FLOW[idx + 1]
  return null
}

function StatusProgress({ currentStatus }) {
  const currentIdx = STATUS_FLOW.findIndex((s) => s.key === normalizeStatus(currentStatus))

  return (
    <div className="status-progress">
      {STATUS_FLOW.map((step, i) => {
        const isDone = i <= currentIdx
        const isCurrent = i === currentIdx
        return (
          <div key={step.key} className={`status-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}>
            <div className="status-step-dot">{isDone ? '✓' : i + 1}</div>
            <div className="status-step-label">{step.label}</div>
            {i < STATUS_FLOW.length - 1 && <div className="status-step-line" />}
          </div>
        )
      })}
    </div>
  )
}

export default function Jobs() {
  const { connected, socketError, liveJobs, setLiveJobs, incomingJob, setIncomingJob, reminders, paymentReceived } = useSocket()
  const [tab, setTab] = useState('live')
  const [broadcast, setBroadcast] = useState([])
  const [current, setCurrent] = useState([])
  const [accepted, setAccepted] = useState([])
  const [acceptedScheduled, setAcceptedScheduled] = useState([])
  const [acceptedPage, setAcceptedPage] = useState(1)
  const [acceptedTotal, setAcceptedTotal] = useState(0)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [page, setPage] = useState(1)
  const [beforeFile, setBeforeFile] = useState(null)
  const [afterFile, setAfterFile] = useState(null)
  const beforeRef = useRef(null)
  const afterRef = useRef(null)

  const load = async () => {
    try {
      const [b, c, h] = await Promise.allSettled([
        getBroadcastedJobs(1, 50),
        getCurrentJobs(),
        getJobHistory(page, 20)
      ])
      const broadcastData = b.status === 'fulfilled' ? (extractResult(b.value?.data) || []) : []
      const currentData = c.status === 'fulfilled' ? (extractResult(c.value?.data) || []) : []
      const historyData = h.status === 'fulfilled' ? (extractResult(h.value?.data) || []) : []
      if (b.status === 'rejected') console.error('Broadcast jobs error:', b.reason)
      if (c.status === 'rejected') {
        console.error('Current jobs error:', c.reason)
        setError(extractMessage(c.reason, 'Could not load current jobs'))
      }
      if (h.status === 'rejected') console.error('Job history error:', h.reason)
      setBroadcast(broadcastData)
      setCurrent(currentData)
      setHistory(historyData)
      if (c.status === 'fulfilled' && currentData.length === 0) {
        const currentMsg = c.value?.data?.message
        if (currentMsg && !currentMsg.toLowerCase().includes('active jobs fetched')) {
          setInfo(currentMsg)
        }
      } else if (c.status === 'fulfilled') {
        setInfo('')
      }
    } catch (err) {
      console.error('Jobs load error:', err)
      setError(extractMessage(err, 'Could not load jobs'))
    }
  }

  const selectTab = (nextTab) => {
    setTab(nextTab)
    if (nextTab === 'current' || nextTab === 'broadcast' || nextTab === 'history') {
      load()
    }
    if (nextTab === 'accepted') {
      loadAccepted()
    }
    if (nextTab === 'scheduled') {
      loadScheduled()
    }
  }

  const loadAccepted = async () => {
    try {
      const res = await getAcceptedJobs(acceptedPage, 20)
      const data = extractResult(res.data) || []
      setAccepted(data)
      setAcceptedTotal(res.data?.pagination?.totalCount || 0)
    } catch (err) {
      console.error('Accepted jobs error:', err)
      setError(extractMessage(err, 'Could not load accepted jobs'))
    }
  }

  const loadScheduled = async () => {
    try {
      const res = await getAcceptedScheduledJobs(acceptedPage, 20)
      const data = extractResult(res.data) || []
      setAcceptedScheduled(data)
      setAcceptedTotal(res.data?.pagination?.totalCount || 0)
    } catch (err) {
      console.error('Accepted scheduled jobs error:', err)
      setError(extractMessage(err, 'Could not load scheduled jobs'))
    }
  }

  useEffect(() => {
    load()
  }, [page])

  useEffect(() => {
    if (tab === 'accepted') loadAccepted()
    if (tab === 'scheduled') loadScheduled()
  }, [acceptedPage])

  const respond = async (bookingId, action) => {
    setError('')
    setMessage('')
    setLoading(true)
    try {
      console.log('=== RESPOND TO JOB ===', bookingId, action)
      const res = await respondToJob(bookingId, action)
      console.log('Respond response:', res.data)
      setMessage(extractResult(res.data)?.message || `Job ${action}`)
      setLiveJobs((prev) => prev.filter((j) => toText(j.bookingId || j._id) !== bookingId))
      setIncomingJob((prev) => (prev && toText(prev.bookingId) === bookingId ? null : prev))
      await load()
      if (action === 'accepted' || action === 'accept') setTab('current')
    } catch (err) {
      console.error('Respond error:', err.response?.data, err.response?.status)
      setError(extractMessage(err, 'Could not respond to job'))
    } finally {
      setLoading(false)
    }
  }

  const changeStatus = async (bookingId, status) => {
    if (!bookingId) {
      setError('Booking ID not found. Cannot update status.')
      return
    }
    setError('')
    setMessage('')
    setLoading(true)
    try {
      console.log('=== CHANGE STATUS ===', bookingId, '→', status)
      const res = await updateJobStatus(bookingId, status)
      console.log('Status change response:', res.data)
      setMessage(extractResult(res.data)?.message || `Status changed to ${status}`)
      await load()
    } catch (err) {
      const msg = extractMessage(err, 'Could not update job status')
      if (msg.includes('work images required')) {
        setError('Upload before & after work images before marking complete')
        setExpanded(bookingId)
      } else if (msg.includes('already taken')) {
        setError('Job already taken by another technician')
        await load()
      } else if (msg.includes('not approved')) {
        setError('Your account is not approved. Complete KYC and training.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const cancel = async (bookingId) => {
    if (!bookingId) {
      setError('Booking ID not found.')
      return
    }
    if (!window.confirm('Cancel this booking? ₹200 penalty will be deducted from your wallet.')) return
    setError('')
    setMessage('')
    setLoading(true)
    try {
      console.log('=== CANCEL BOOKING ===', bookingId)
      const res = await cancelBooking(bookingId, 'Technician unavailable')
      console.log('Cancel response:', res.data)
      const msg = extractResult(res.data)?.message || 'Booking cancelled'
      setMessage(msg)
      await load()
    } catch (err) {
      setError(extractMessage(err, 'Could not cancel booking'))
    } finally {
      setLoading(false)
    }
  }

  const reaccept = async (bookingId) => {
    if (!bookingId) {
      setError('Booking ID not found.')
      return
    }
    setError('')
    setMessage('')
    setLoading(true)
    try {
      console.log('=== RE-ACCEPT CANCELLED JOB ===', bookingId)
      const res = await reacceptCancelledJob(bookingId, false)
      console.log('Re-accept response:', res.data)
      const msg = extractResult(res.data)?.message || 'Job re-accepted'
      setMessage(msg)
      await load()
      setTab('current')
    } catch (err) {
      setError(extractMessage(err, 'Could not re-accept job'))
    } finally {
      setLoading(false)
    }
  }

  const uploadImages = async (bookingId) => {
    if (!bookingId) {
      setError('Booking ID not found.')
      return
    }
    if (!beforeFile || !afterFile) {
      setError('Both before and after images are required')
      return
    }
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('beforeImage', beforeFile)
      fd.append('afterImage', afterFile)
      console.log('=== UPLOAD WORK IMAGES ===', bookingId)
      console.log('Before:', beforeFile.name, beforeFile.size)
      console.log('After:', afterFile.name, afterFile.size)
      const res = await uploadWorkImages(bookingId, fd)
      console.log('Upload response:', res.data)
      setMessage('Work images uploaded successfully')
      setExpanded(null)
      setBeforeFile(null)
      setAfterFile(null)
      if (beforeRef.current) beforeRef.current.value = ''
      if (afterRef.current) afterRef.current.value = ''
      await load()
    } catch (err) {
      setError(extractMessage(err, 'Could not upload work images'))
    } finally {
      setLoading(false)
    }
  }

  const jobId = (j) => {
    if (!j) return ''
    const id = j.jobId || j._id || j.bookingId || j.booking?._id || j.id || j.booking?._id
    return toText(id)
  }

  const CurrentJobCard = ({ job }) => {
    const id = jobId(job)
    const status = normalizeStatus(job.status || job.bookingStatus)
    const next = getNextStatus(status)
    const isExpanded = expanded === id
    const serviceName = toText(job.serviceName || job.service?.serviceName || job.service?.name || job.title) || 'Service'
    const customerName = toText(job.customerName) || [job.customer?.fname, job.customer?.lname].filter(Boolean).join(' ')

    return (
      <div className="job-card">
        <div className="job-head">
          <div>
            <strong>Booking: {id}</strong>
            <div className="muted">
              {serviceName}
            </div>
            <div className="muted">
              {customerName ? `Customer: ${customerName}` : ''}
            </div>
            {toText(job.customer?.mobileNumber) && (
              <div className="muted">Phone: {toText(job.customer?.mobileNumber)}</div>
            )}
            <div className="muted">
              {toText(job.address?.addressLine || job.address) || ''}
            </div>
            {toText(job.technicianAmount) != null && (
              <div><strong>{formatCurrency(job.service?.technicianAmount || job.technicianAmount)}</strong></div>
            )}
          </div>
          <Badge status={status} />
        </div>

        <StatusProgress currentStatus={status} />

        <div className="job-actions" style={{ marginTop: 12 }}>
          {next && (
            <Button loading={loading} onClick={() => changeStatus(id, next.key)}>
              {next.key === 'on_the_way' && '🚗 Mark On The Way'}
              {next.key === 'reached' && '📍 Mark Reached'}
              {next.key === 'in_progress' && '🔧 Start Work'}
              {next.key === 'completed' && '✅ Mark Completed'}
            </Button>
          )}
          <Button loading={loading} className="btn-outline" onClick={() => cancel(id)}>
            Cancel (₹200 penalty)
          </Button>
        </div>

        {status === 'in_progress' && (
          <div style={{ marginTop: 12 }}>
            <Button className="btn-outline" onClick={() => {
              setExpanded(isExpanded ? null : id)
              setBeforeFile(null)
              setAfterFile(null)
            }}>
              {isExpanded ? 'Hide Image Upload' : '📷 Upload Work Images'}
            </Button>
          </div>
        )}

        {status === 'in_progress' && isExpanded && (
          <div className="work-images-section">
            <p className="muted" style={{ marginBottom: 8 }}>
              Upload before and after images to enable the "Mark Completed" button.
            </p>
            <label className="field">
              Before Image *
              <input
                ref={beforeRef}
                type="file"
                accept="image/*"
                onChange={(e) => setBeforeFile(e.target.files[0] || null)}
              />
              {beforeFile && <span className="file-name">{beforeFile.name}</span>}
            </label>
            <label className="field">
              After Image *
              <input
                ref={afterRef}
                type="file"
                accept="image/*"
                onChange={(e) => setAfterFile(e.target.files[0] || null)}
              />
              {afterFile && <span className="file-name">{afterFile.name}</span>}
            </label>
            <Button loading={loading} onClick={() => uploadImages(id)} disabled={!beforeFile || !afterFile}>
              Upload Images
            </Button>
          </div>
        )}
      </div>
    )
  }

  const BroadcastJobCard = ({ job }) => {
    const id = jobId(job)
    return (
      <div className="job-card">
        <div className="job-head">
          <div>
            <strong>Booking: {id}</strong>
            {job.broadcastId && (
              <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>
                bcast: {job.broadcastId}
              </span>
            )}            <div className="muted">
              {toText(job.serviceName || job.service?.name || job.title) || 'Service'}
              {toText(job.serviceType) ? ` (${toText(job.serviceType)})` : ''}
            </div>
            <div className="muted">
              {toText(job.customerName) ? `Customer: ${toText(job.customerName)}` : ''}
            </div>
            <div className="muted">
              {toText(job.address || job.location?.address) || ''}
            </div>
            {job.scheduledAt && (
              <div className="muted">Scheduled: {formatDate(job.scheduledAt)}</div>
            )}
            {toText(job.description) && (
              <div className="muted">Desc: {toText(job.description)}</div>
            )}
            {toText(job.duration) && (
              <div className="muted">Est. {toText(job.duration)} min</div>
            )}
          </div>
<Badge status={normalizeStatus(job.status || job.bookingStatus)} />
        </div>
        <div className="job-actions">
          <Button loading={loading} onClick={() => respond(id, 'accepted')}>
              Accept
            </Button>
            <Button loading={loading} onClick={() => respond(id, 'declined')}>
              Decline
            </Button>
        </div>
      </div>
    )
  }

  const AcceptedJobCard = ({ job }) => {
    const id = jobId(job)
    const status = normalizeStatus(job.status || job.bookingStatus)
    const next = getNextStatus(status)
    const serviceName = toText(job.serviceName || job.service?.serviceName || job.service?.name || job.title) || 'Service'
    const customerName = toText(job.customerName) || [job.customer?.fname, job.customer?.lname].filter(Boolean).join(' ')

    return (
      <div className="job-card">
        <div className="job-head">
          <div>
            <strong>Booking: {id}</strong>
            <div className="muted">
              {serviceName}
              {job.bookingType ? ` (${toText(job.bookingType)})` : ''}
            </div>
            <div className="muted">
              {customerName ? `Customer: ${customerName}` : ''}
            </div>
            {toText(job.customer?.mobileNumber) && (
              <div className="muted">Phone: {toText(job.customer?.mobileNumber)}</div>
            )}
            <div className="muted">
              {toText(job.address?.addressLine || job.address) || ''}
            </div>
            {job.scheduledAt && (
              <div className="muted">Scheduled: {formatDate(job.scheduledAt)}</div>
            )}
            {toText(job.technicianAmount) != null && (
              <div><strong>{formatCurrency(job.service?.technicianAmount || job.technicianAmount)}</strong></div>
            )}
          </div>
          <Badge status={status} />
        </div>
        <StatusProgress currentStatus={status} />
        <div className="job-actions" style={{ marginTop: 12 }}>
          {next && (
            <Button loading={loading} onClick={() => changeStatus(id, next.key)}>
              {next.key === 'on_the_way' && '🚗 Mark On The Way'}
              {next.key === 'reached' && '📍 Mark Reached'}
              {next.key === 'in_progress' && '🔧 Start Work'}
              {next.key === 'completed' && '✅ Mark Completed'}
            </Button>
          )}
          <Button loading={loading} className="btn-outline" onClick={() => cancel(id)}>
            Cancel (₹200 penalty)
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2>Jobs</h2>
      <Alert type="error">{error}</Alert>
      <Alert type="success">{message}</Alert>
      <Alert type="info">{info}</Alert>

      {reminders.length > 0 && (
        <div className="reminders-container">
          {reminders.map((r) => (
            <Alert key={r.id} type={r.type === 'min15' ? 'error' : 'info'}>
              {r.message || `${r.type === 'h24' ? 'Job in 24 hours' : r.type === 'h1' ? 'Job in 1 hour' : 'Job in 15 minutes'}: ${toText(r.bookingId)}`}
            </Alert>
          ))}
        </div>
      )}

      {paymentReceived && (
        <Alert type="success">
          Payment received: {formatCurrency(paymentReceived.amount)} for booking {toText(paymentReceived.bookingId)}
        </Alert>
      )}

<div className="tabs" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <button className={tab === 'live' ? 'active' : ''} onClick={() => selectTab('live')}>
          Live Jobs ({liveJobs.length})
        </button>
        <button className={tab === 'broadcast' ? 'active' : ''} onClick={() => selectTab('broadcast')}>
          Broadcasted ({broadcast.length})
        </button>
        <button className={tab === 'current' ? 'active' : ''} onClick={() => selectTab('current')}>
          Current ({current.length})
        </button>
        <button className={tab === 'accepted' ? 'active' : ''} onClick={() => selectTab('accepted')}>
          Accepted ({accepted.length})
        </button>
        <button className={tab === 'scheduled' ? 'active' : ''} onClick={() => selectTab('scheduled')}>
          Scheduled ({acceptedScheduled.length})
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => selectTab('history')}>
          History
        </button>
      </div>

      {tab === 'live' && (
        <Card title="Live Jobs (Real-time via Socket)">
          {!connected && (
            <Alert type="error">{socketError || 'Socket not connected. Jobs will not arrive in real-time.'}</Alert>
          )}

          {incomingJob && (
            <div className="job-card incoming-job">
              <div className="job-head">
                <div>
                  <span className="badge-new">NEW</span>
                  <strong style={{ marginLeft: 8 }}>New job available!</strong>
                  <div className="muted">
                    {toText(incomingJob.serviceName) || 'Service'}
                    {toText(incomingJob.serviceType) ? ` (${toText(incomingJob.serviceType)})` : ''}
                  </div>
                  <div className="muted">
                    {toText(incomingJob.customerName) ? `Customer: ${toText(incomingJob.customerName)}` : ''}
                  </div>
                  {toText(incomingJob.address) && (
                    <div className="muted">{toText(incomingJob.address)}</div>
                  )}
                  {toText(incomingJob.description) && (
                    <div className="muted">Desc: {toText(incomingJob.description)}</div>
                  )}
                  {toText(incomingJob.duration) && (
                    <div className="muted">Est. {toText(incomingJob.duration)} min</div>
                  )}
                  {toText(incomingJob.baseAmount) != null && (
                    <div><strong>{formatCurrency(incomingJob.baseAmount)}</strong></div>
                  )}
                  {incomingJob.scheduledAt && (
                    <div className="muted">Scheduled: {formatDate(incomingJob.scheduledAt)}</div>
                  )}
                </div>
              </div>
              <div className="job-actions">
                <Button loading={loading} onClick={() => respond(toText(incomingJob.bookingId), 'accepted')}>
                  Accept
                </Button>
                <Button loading={loading} onClick={() => respond(toText(incomingJob.bookingId), 'declined')}>
                  Decline
                </Button>
              </div>
            </div>
          )}

          {liveJobs.length === 0 && !incomingJob && (
            <p className="muted">
              No live jobs right now. Keep location tracking on — new jobs appear here in real time.
            </p>
          )}

          {liveJobs.map((job) => (
            <div key={job.broadcastId || toText(job.bookingId || job._id)} className="job-card">
              <div className="job-head">
                <div>
                  <strong>Booking: {toText(job.bookingId || job._id)}</strong>
                  {job.broadcastId && (
                    <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>
                      v{job.version}
                    </span>
                  )}
                  <div className="muted">
                    {toText(job.serviceName || job.service?.name || job.title) || 'Service'}
                    {toText(job.serviceType) ? ` (${toText(job.serviceType)})` : ''}
                  </div>
                  <div className="muted">
                    {toText(job.customerName) ? `Customer: ${toText(job.customerName)}` : ''}
                  </div>
                  <div className="muted">
                    {toText(job.distanceStr) ? `${toText(job.distanceStr)} away` : ''}
                    {toText(job.address) ? ` | ${toText(job.address)}` : ''}
                  </div>
                  {toText(job.description) && (
                    <div className="muted">Desc: {toText(job.description)}</div>
                  )}
                  {toText(job.technicianAmount) != null && (
                    <div><strong>{formatCurrency(job.technicianAmount)}</strong></div>
                  )}
                </div>
              </div>
              <div className="job-actions">
                <Button loading={loading} onClick={() => respond(toText(job.bookingId || job._id), 'accepted')}>
                  Accept
                </Button>
                <Button loading={loading} onClick={() => respond(toText(job.bookingId || job._id), 'declined')}>
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {tab === 'broadcast' && (
        <Card title="My Broadcasted Jobs">
          {broadcast.length === 0 ? (
            <p className="muted">No broadcasted jobs.</p>
          ) : (
            broadcast.map((job) => (
              <BroadcastJobCard key={jobId(job)} job={job} />
            ))
          )}
        </Card>
      )}

      {tab === 'current' && (
        <Card title="Current Jobs">
          {current.length === 0 ? (
            <p className="muted">No current jobs.</p>
          ) : (
            current.map((job) => (
              <CurrentJobCard key={jobId(job)} job={job} />
            ))
          )}
        </Card>
      )}

      {tab === 'accepted' && (
        <Card title="Accepted Jobs (newest first)">
          {accepted.length === 0 ? (
            <p className="muted">No accepted jobs.</p>
          ) : (
            accepted.map((job) => <AcceptedJobCard key={jobId(job)} job={job} />)
          )}
          {acceptedTotal > 20 && (
            <div className="pagination">
              <Button className="btn-small btn-outline" disabled={acceptedPage <= 1} onClick={() => setAcceptedPage(acceptedPage - 1)}>
                Prev
              </Button>
              <span>Page {acceptedPage}</span>
              <Button className="btn-small btn-outline" disabled={acceptedPage * 20 >= acceptedTotal} onClick={() => setAcceptedPage(acceptedPage + 1)}>
                Next
              </Button>
            </div>
          )}
        </Card>
      )}

      {tab === 'scheduled' && (
        <Card title="Accepted Scheduled Jobs (soonest first)">
          {acceptedScheduled.length === 0 ? (
            <p className="muted">No accepted scheduled jobs.</p>
          ) : (
            acceptedScheduled.map((job) => <AcceptedJobCard key={jobId(job)} job={job} />)
          )}
        </Card>
      )}

      {tab === 'history' && (
        <Card title="Job History">
          {history.length === 0 ? (
            <p className="muted">No job history.</p>
          ) : (
            <>
              {history.map((job) => {
                const hServiceName = toText(job.serviceName || job.service?.serviceName || job.service?.name || job.serviceId?.serviceName || job.title) || 'Service'
                const hCustomerName = toText(job.customerName) || [job.customer?.fname, job.customer?.lname, job.customerId?.fname, job.customerId?.lname].filter(Boolean).join(' ')
                const hStatus = normalizeStatus(job.status || job.bookingStatus)
                return (
                  <div key={jobId(job)} className="job-card">
                    <div className="job-head">
                      <div>
                        <strong>Booking: {jobId(job)}</strong>
                        <div className="muted">
                          {hServiceName}
                          {hCustomerName ? ` | ${hCustomerName}` : ''}
                        </div>
                        <div className="muted">{formatDate(job.createdAt)}</div>
                      </div>
                      <Badge status={hStatus} />
                    </div>
                    {hStatus === 'cancelled' && (
                      <div className="job-actions">
                        <Button loading={loading} onClick={() => reaccept(jobId(job))}>
                          Re-accept (no penalty)
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="pagination">
                <Button className="btn-small btn-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Prev
                </Button>
                <span>Page {page}</span>
                <Button className="btn-small btn-outline" disabled={history.length < 20} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  )
}

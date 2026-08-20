import { toText } from '../utils/helpers'

export default function Badge({ status }) {
  status = toText(status)
  if (!status) return null
  const map = {
    pending: 'badge-warning',
    accepted: 'badge-success',
    declined: 'badge-danger',
    completed: 'badge-success',
    in_progress: 'badge-info',
    on_the_way: 'badge-info',
    cancelled: 'badge-danger',
    rejected: 'badge-danger',
    approved: 'badge-success',
    verified: 'badge-success',
    unverified: 'badge-warning',
    available: 'badge-success',
    unavailable: 'badge-danger',
    online: 'badge-success',
    offline: 'badge-danger'
  }
  return <span className={`badge ${map[status] || 'badge-neutral'}`}>{status}</span>
}

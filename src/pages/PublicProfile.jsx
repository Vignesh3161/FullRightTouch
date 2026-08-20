import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTechnicianById } from '../api/endpoints'
import { extractResult, skillId, skillLabel, toText } from '../utils/helpers'
import { extractMessage } from '../api/client'
import Card from '../components/Card'
import Badge from '../components/Badge'
import Alert from '../components/Alert'

export default function PublicProfile() {
  const { id } = useParams()
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    getTechnicianById(id)
      .then((res) => setProfile(extractResult(res.data)))
      .catch((err) => setError(extractMessage(err, 'Could not load technician')))
  }, [id])

  if (!profile) {
    return (
      <div>
        <h2>Technician Profile</h2>
        <Alert type="error">{error}</Alert>
        <p className="muted">Loading or no technician found for ID: {id}</p>
      </div>
    )
  }

  const rows = [
    ['Name', `${toText(profile.fname)} ${toText(profile.lname)}`.trim() || '-'],
    ['Mobile', toText(profile.mobile) || '-'],
    ['City', toText(profile.city) || '-'],
    ['State', toText(profile.state) || '-'],
    ['Locality', toText(profile.locality) || '-'],
    ['Experience', profile.experienceYears ? `${toText(profile.experienceYears)} years` : '-'],
    ['Work Status', <Badge status={profile.workStatus} />],
    ['Availability', profile.availability?.isOnline ? 'Online' : 'Offline'],
    ['Training', profile.trainingCompleted ? 'Completed' : 'Pending']
  ]

  return (
    <div>
      <h2>Technician Profile</h2>
      <div className="grid-2">
        <Card title="Details">
          <table className="table">
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Skills">
          {profile.skills?.length ? (
            <ul className="list">
              {profile.skills.map((s, i) => (
                <li key={skillId(s) || `skill-${i}`}>
                  {skillLabel(s)}
                  {s.experienceYears ? ` (${s.experienceYears} yrs)` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No skills listed.</p>
          )}
        </Card>
      </div>
    </div>
  )
}

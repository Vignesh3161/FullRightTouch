import { useEffect, useState } from 'react'
import {
  createTechnicianProfile,
  updateTechnician,
  updateAvailability,
  addSkills,
  removeSkills,
  updateTraining,
  uploadProfileImage,
  updateLiveLocation,
  getMyProfile,
  getAllServices
} from '../api/endpoints'
import { extractResult, getTechnicianId, skillId, skillLabel, toText } from '../utils/helpers'
import { extractMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import useCurrentLocation from '../utils/useCurrentLocation'
import Card from '../components/Card'
import Field from '../components/Field'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Alert from '../components/Alert'

export default function Profile() {
  const { profile, setProfile } = useAuth()
  const [form, setForm] = useState({
    fname: '',
    lname: '',
    city: '',
    state: '',
    locality: '',
    experienceYears: ''
  })
  const [skill, setSkill] = useState({ serviceIds: '', experienceYears: '' })
  const [skillToRemove, setSkillToRemove] = useState('')
  const [isOnline, setIsOnline] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [training, setTraining] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [hasProfile, setHasProfile] = useState(false)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [services, setServices] = useState([])
  const [filteredServices, setFilteredServices] = useState([])
  const [serviceSearch, setServiceSearch] = useState('')
  const [serviceLoading, setServiceLoading] = useState(false)
  const { coords, setCoords, locating, setLocationError, getLocation } = useCurrentLocation()

  useEffect(() => {
    if (profile) {
      setForm({
        fname: profile.fname || '',
        lname: profile.lname || '',
        city: profile.city || '',
        state: profile.state || '',
        locality: profile.locality || '',
        experienceYears: profile.experienceYears || ''
      })
      setHasProfile(!!(profile.fname || profile.locality))
      setIsOnline(!!profile.availability?.isOnline)
      setTraining(!!profile.trainingCompleted)
      setCoords({
        latitude: profile.latitude ?? profile.location?.latitude ?? '',
        longitude: profile.longitude ?? profile.location?.longitude ?? ''
      })
    }
  }, [profile])

  const refresh = async () => {
    const res = await getMyProfile()
    const p = extractResult(res.data)
    setProfile(p)
    return p
  }

  const loadServices = async () => {
    setServiceLoading(true)
    try {
      const res = await getAllServices()
      const data = extractResult(res.data)
      const servicesList = data?.services || data || []
      setServices(servicesList)
      setFilteredServices(servicesList)
    } catch (err) {
      setError(extractMessage(err, 'Could not load services'))
    } finally {
      setServiceLoading(false)
    }
  }

  const handleServiceSearch = (e) => {
    const term = e.target.value.toLowerCase()
    setServiceSearch(term)
    setFilteredServices(services.filter((s) =>
      toText(s.name || s.serviceName || s._id).toLowerCase().includes(term) ||
      toText(s.category).toLowerCase().includes(term)
    ))
  }

  const selectService = (service) => {
    const id = skillId(service)
    setSkill({ ...skill, serviceIds: id })
    setShowServiceModal(false)
    setServiceSearch('')
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      await createTechnicianProfile({
        ...form,
        experienceYears: Number(form.experienceYears) || undefined,
        skills: []
      })
      setMessage('Profile created successfully')
      setHasProfile(true)
      await refresh()
    } catch (err) {
      setError(extractMessage(err, 'Could not create profile'))
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      await updateTechnician({
        city: form.city,
        locality: form.locality,
        state: form.state,
        fname: form.fname,
        lname: form.lname,
        experienceYears: Number(form.experienceYears) || undefined
      })
      setMessage('Profile updated successfully')
      await refresh()
    } catch (err) {
      setError(extractMessage(err, 'Could not update profile'))
    } finally {
      setLoading(false)
    }
  }

  const handleAddSkill = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const ids = skill.serviceIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (ids.length === 0) {
        setError('Enter at least one service ID')
        return
      }
      await addSkills(ids, Number(skill.experienceYears) || undefined)
      setMessage('Skill(s) added')
      setSkill({ serviceIds: '', experienceYears: '' })
      await refresh()
    } catch (err) {
      setError(extractMessage(err, 'Could not add skill'))
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveSkill = async () => {
    if (!skillToRemove) return
    setError('')
    setMessage('')
    setLoading(true)
    try {
      await removeSkills([skillToRemove])
      setMessage('Skill removed')
      setSkillToRemove('')
      await refresh()
    } catch (err) {
      setError(extractMessage(err, 'Could not remove skill'))
    } finally {
      setLoading(false)
    }
  }

  const handleAvailability = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      if (isOnline) {
        const loc = await getLocation()
        await updateLiveLocation(Number(loc.latitude), Number(loc.longitude))
        setCoords(loc)
      }
      await updateAvailability(isOnline)
      setMessage(`You are now ${isOnline ? 'online' : 'offline'}`)
      await refresh()
    } catch (err) {
      setError(extractMessage(err, 'Could not update availability'))
    } finally {
      setLoading(false)
    }
  }

  const handleTraining = async () => {
    const id = getTechnicianId() || profile?._id
    if (!id) {
      setError('Technician id not available')
      return
    }
    setError('')
    setMessage('')
    setLoading(true)
    try {
      await updateTraining(id, training)
      setMessage('Training status updated')
      await refresh()
    } catch (err) {
      setError(extractMessage(err, 'Could not update training'))
    } finally {
      setLoading(false)
    }
  }

  const handleImageUpload = async (e) => {
    e.preventDefault()
    if (!imageFile) return
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('profileImage', imageFile)
      await uploadProfileImage(fd)
      setMessage('Profile image uploaded')
      setImageFile(null)
      await refresh()
    } catch (err) {
      setError(extractMessage(err, 'Could not upload image'))
    } finally {
      setLoading(false)
    }
  }

  const handleLocation = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      await updateLiveLocation(Number(coords.latitude), Number(coords.longitude))
      setMessage('Live location updated')
      await refresh()
    } catch (err) {
      setError(extractMessage(err, 'Could not update location'))
    } finally {
      setLoading(false)
    }
  }

  const getMyLocation = async () => {
    setError('')
    setMessage('')
    setLocationError('')
    try {
      const loc = await getLocation()
      setMessage(`Location found: ${loc.latitude}, ${loc.longitude}`)
    } catch (err) {
      setError(extractMessage(err, 'Could not get browser location'))
    }
  }

  return (
    <div>
      <h2>Profile</h2>
      <Alert type="error">{error}</Alert>
      <Alert type="success">{message}</Alert>

      <div className="grid-2">
        <Card title={hasProfile ? 'Update Profile' : 'Create Profile'}>
          <form onSubmit={hasProfile ? handleUpdate : handleCreate}>
            <div className="grid-2">
              <Field label="First Name">
                <input value={form.fname} onChange={(e) => setForm({ ...form, fname: e.target.value })} />
              </Field>
              <Field label="Last Name">
                <input value={form.lname} onChange={(e) => setForm({ ...form, lname: e.target.value })} />
              </Field>
              <Field label="City">
                <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </Field>
              <Field label="State">
                <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
              </Field>
              <Field label="Locality">
                <input value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })} />
              </Field>
              <Field label="Experience (years)">
                <input
                  type="number"
                  value={form.experienceYears}
                  onChange={(e) => setForm({ ...form, experienceYears: e.target.value })}
                />
              </Field>
            </div>
            <Button loading={loading} type="submit">
              {hasProfile ? 'Update Profile' : 'Create Profile'}
            </Button>
          </form>
        </Card>

        <div>
          <Card title="Availability">
            <form onSubmit={handleAvailability}>
              <p className="muted" style={{ marginBottom: 10 }}>
                Current status: {isOnline ? 'Online (available for jobs)' : 'Offline'}
              </p>
              <label className="checkbox">
                <input type="checkbox" checked={isOnline} onChange={(e) => setIsOnline(e.target.checked)} />
                Go online / available for jobs
              </label>
              <Button loading={loading} type="submit">
                Update Availability
              </Button>
            </form>
          </Card>

          <Card title="Training">
            <label className="checkbox">
              <input type="checkbox" checked={training} onChange={(e) => setTraining(e.target.checked)} />
              Training completed
            </label>
            <Button loading={loading} onClick={handleTraining}>
              Update Training
            </Button>
          </Card>
        </div>
      </div>

      <div className="grid-2">
        <Card title="Skills">
          {profile?.skills?.length ? (
            <ul className="list">
              {profile.skills.map((s, i) => (
                <li key={skillId(s) || `skill-${i}`}>
                  <span>
                    {skillLabel(s)}
                    {s.experienceYears ? ` (${s.experienceYears} yrs)` : ''}
                  </span>
                  <Badge status={toText(s.status || s.verificationStatus)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No skills added yet.</p>
          )}

          <form onSubmit={handleAddSkill}>
            <div className="grid-2">
              <Field label="Service IDs (comma separated)">
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    required
                    placeholder="id1, id2"
                    value={skill.serviceIds}
                    onChange={(e) => setSkill({ ...skill, serviceIds: e.target.value })}
                    style={{ flex: 1 }}
                  />
                  <Button type="button" variant="outline" onClick={() => { loadServices(); setShowServiceModal(true); }}>
                    Browse Services
                  </Button>
                </div>
              </Field>
              <Field label="Experience (years)">
                <input
                  type="number"
                  value={skill.experienceYears}
                  onChange={(e) => setSkill({ ...skill, experienceYears: e.target.value })}
                />
              </Field>
            </div>
            <Button loading={loading} type="submit">
              Add Skill
            </Button>
          </form>

          <form onSubmit={(e) => { e.preventDefault(); handleRemoveSkill() }}>
            <Field label="Remove skill (Service ID)">
              <select value={skillToRemove} onChange={(e) => setSkillToRemove(e.target.value)}>
                <option value="">Select skill to remove</option>
                {profile?.skills?.map((s) => (
                  <option key={skillId(s)} value={skillId(s)}>
                    {skillLabel(s)}
                  </option>
                ))}
              </select>
            </Field>
            <Button loading={loading} type="submit">
              Remove Skill
            </Button>
          </form>
        </Card>

        <Card title="Profile Image">
          <form onSubmit={handleImageUpload}>
            <Field label="Choose image">
              <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files[0])} />
            </Field>
            <Button loading={loading} type="submit" disabled={!imageFile}>
              Upload Image
            </Button>
          </form>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Live Location">
          <form onSubmit={handleLocation}>
            <div className="grid-2">
              <Field label="Latitude">
                <input type="number" step="any" value={coords.latitude} onChange={(e) => setCoords({ ...coords, latitude: e.target.value })} />
              </Field>
              <Field label="Longitude">
                <input type="number" step="any" value={coords.longitude} onChange={(e) => setCoords({ ...coords, longitude: e.target.value })} />
              </Field>
            </div>
            <div className="row">
              <Button loading={loading} type="submit">
                Update Location
              </Button>
              <Button type="button" loading={locating} onClick={getMyLocation}>
                Get My Location
              </Button>
            </div>
          </form>
        </Card>

        <Card title="View by ID">
          <p className="muted">Current technician ID: {getTechnicianId() || profile?._id || '-'}</p>
          <a className="btn btn-outline" href={`/profile/${getTechnicianId() || profile?._id || ''}`}>
            Open Public Profile
          </a>
        </Card>
      </div>

      {showServiceModal && (
        <div className="modal-overlay" onClick={() => setShowServiceModal(false)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20
        }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{
            background: 'white', borderRadius: 8, width: '100%', maxWidth: 600, maxHeight: '80vh',
            overflow: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
          }}>
            <div style={{ padding: 16, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Select Service</h3>
              <button onClick={() => setShowServiceModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 16 }}>
              <input
                type="text"
                placeholder="Search services..."
                value={serviceSearch}
                onChange={handleServiceSearch}
                style={{ width: '100%', padding: '8px 12px', marginBottom: 12, border: '1px solid #ddd', borderRadius: 4 }}
              />
              {serviceLoading ? (
                <p className="muted">Loading services...</p>
              ) : filteredServices.length === 0 ? (
                <p className="muted">No services found.</p>
              ) : (
                <div style={{ maxHeight: 400, overflow: 'auto' }}>
                  {filteredServices.map((service) => {
                    const id = skillId(service)
                    const name = skillLabel(service)
                    const added = profile?.skills?.some((s) => skillId(s) === id)
                    return (
                      <div
                        key={id}
                        onClick={() => selectService(service)}
                        style={{
                          padding: '12px', borderBottom: '1px solid #eee', cursor: 'pointer',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          background: added ? '#f0fdf4' : 'transparent'
                        }}
                      >
                        <div>
                          <strong>{name}</strong>
                          <div className="muted" style={{ fontSize: 12 }}>
                            Category: {toText(service.category) || '-'} | ID: {id}
                          </div>
                        </div>
                        {added ? (
                          <Badge status="verified" style={{ fontSize: 11 }}>Already Added</Badge>
                        ) : (
                          <span style={{ color: '#2563eb', fontSize: 13 }}>Select</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

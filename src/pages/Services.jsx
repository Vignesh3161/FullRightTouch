import { useEffect, useState } from 'react'
import { getAllServices, getMyProfile } from '../api/endpoints'
import { addSkills } from '../api/endpoints'
import { extractResult, toText, skillId, skillLabel } from '../utils/helpers'
import { extractMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import Card from '../components/Card'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Alert from '../components/Alert'
import Field from '../components/Field'

export default function Services() {
  const { profile, setProfile } = useAuth()
  const [services, setServices] = useState([])
  const [filteredServices, setFilteredServices] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [addingSkill, setAddingSkill] = useState(null)

  const loadServices = async (pageNum = 1, searchTerm = '', categoryFilter = '') => {
    setLoading(true)
    setError('')
    try {
      const res = await getAllServices({ page: pageNum, limit: 20, search: searchTerm, category: categoryFilter })
      const data = extractResult(res.data)
      if (data?.services) {
        setServices(data.services)
        setFilteredServices(data.services)
        setTotalPages(data.totalPages || 1)
      } else if (Array.isArray(data)) {
        setServices(data)
        setFilteredServices(data)
      }
    } catch (err) {
      setError(extractMessage(err, 'Could not load services'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadServices(1, '', '')
  }, [])

  const handleSearch = (e) => {
    const term = e.target.value
    setSearch(term)
    setPage(1)
    loadServices(1, term, category)
  }

  const handleCategoryChange = (e) => {
    const cat = e.target.value
    setCategory(cat)
    setPage(1)
    loadServices(1, search, cat)
  }

  const handleAddSkill = async (serviceId, serviceName) => {
    setAddingSkill(serviceId)
    setError('')
    setMessage('')
    try {
      await addSkills([serviceId], 0)
      setMessage(`Added skill: ${serviceName}`)
      // Refresh profile to show updated skills
      const res = await getMyProfile()
      const updatedProfile = extractResult(res.data)
      if (updatedProfile) setProfile(updatedProfile)
    } catch (err) {
      setError(extractMessage(err, 'Could not add skill'))
    } finally {
      setAddingSkill(null)
    }
  }

  const isSkillAdded = (serviceId) => {
    return profile?.skills?.some((s) => skillId(s) === serviceId)
  }

  const categories = [...new Set(services.map((s) => toText(s.category)).filter(Boolean))]

  return (
    <div>
      <h2>Available Services</h2>
      <Alert type="error">{error}</Alert>
      <Alert type="success">{message}</Alert>

      <Card title="Search & Filter">
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <Field label="Search services">
            <input
              type="text"
              placeholder="Search by name, description..."
              value={search}
              onChange={handleSearch}
            />
          </Field>
          <Field label="Category">
            <select value={category} onChange={handleCategoryChange}>
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          Showing {filteredServices.length} of {services.length} services
          {page > 1 && ` (Page ${page})`}
        </div>
      </Card>

      <Card title="Services List">
        {loading ? (
          <p className="muted">Loading services...</p>
        ) : filteredServices.length === 0 ? (
          <p className="muted">No services found.</p>
        ) : (
          <div className="services-list">
            {filteredServices.map((service) => {
              const id = skillId(service)
              const name = skillLabel(service)
              const added = isSkillAdded(id)
              return (
                <div key={id} className="service-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #eee' }}>
                  <div style={{ flex: 1 }}>
                    <strong>{name}</strong>
                    {toText(service.description) && <div className="muted" style={{ fontSize: 13 }}>{toText(service.description)}</div>}
                    <div className="muted" style={{ fontSize: 12 }}>
                      Category: {toText(service.category) || '-'} | ID: {id}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {added ? (
                      <Badge status="verified" style={{ fontSize: 12 }}>Added</Badge>
                    ) : (
                      <Button
                        size="sm"
                        loading={addingSkill === id}
                        onClick={() => handleAddSkill(id, name)}
                        disabled={added}
                      >
                        Add Skill
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="pagination" style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 8 }}>
            <Button className="btn-outline" disabled={page <= 1} onClick={() => loadServices(page - 1, search, category)}>
              Prev
            </Button>
            <span style={{ display: 'flex', alignItems: 'center' }}>Page {page} / {totalPages}</span>
            <Button className="btn-outline" disabled={page >= totalPages} onClick={() => loadServices(page + 1, search, category)}>
              Next
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
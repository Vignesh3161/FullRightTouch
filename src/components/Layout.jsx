import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'

export default function Layout({ children }) {
  const { profile, logout } = useAuth()
  const { connected, sessionMessage, setSessionMessage } = useSocket()
  const [open, setOpen] = useState(false)

  const navItems = [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/profile', label: 'Profile' },
    { to: '/kyc', label: 'KYC & Bank' },
    { to: '/jobs', label: 'Jobs' },
    { to: '/wallet', label: 'Wallet' },
    { to: '/zone', label: 'Zone' }
  ]

  const isActive = (item) => {
    if (item.end) return window.location.pathname === item.to
    return window.location.pathname.startsWith(item.to)
  }

  return (
    <div className="layout">
      {sessionMessage && (
        <div className="session-alert" onClick={() => { setSessionMessage(''); logout() }}>
          <span>{sessionMessage}</span>
          <span className="session-alert-close">Tap to login</span>
        </div>
      )}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-dot">RT</span>
          <div>
            <strong>RightTouch</strong>
            <small>Technician Portal</small>
          </div>
        </div>
        <nav>
          {navItems.map((item) => (
            <a
              key={item.to}
              href={item.to}
              className={isActive(item) ? 'active' : ''}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="avatar">{profile?.fname?.[0] || profile?.name?.[0] || 'T'}</div>
          <div className="sidebar-user-info">
            <strong>{profile ? `${profile.fname || ''} ${profile.lname || ''}`.trim() || 'Technician' : 'Technician'}</strong>
            <small>{profile?.locality || profile?.city || profile?.mobile || ''}</small>
          </div>
          <button className="btn btn-small btn-outline" onClick={logout}>
            Logout
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn btn-small menu-btn" onClick={() => setOpen(!open)}>
            Menu
          </button>
          <h1>RightTouch Technician</h1>
          <span className="socket-status" title={connected ? 'Socket connected' : 'Socket disconnected'}>
            <span className={`status-dot ${connected ? 'on' : ''}`} />
            {connected ? 'Live' : 'Offline'}
          </span>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}

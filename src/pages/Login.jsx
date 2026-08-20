import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestLoginOtp, verifyLoginOtp } from '../api/endpoints'
import { extractResult } from '../utils/helpers'
import { extractMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import Alert from '../components/Alert'
import Button from '../components/Button'
import Field from '../components/Field'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [step, setStep] = useState(1)
  const [identifier, setIdentifier] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const sendOtp = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      await requestLoginOtp(identifier)
      setMessage('OTP sent to your mobile. Enter it to login.')
      setStep(2)
    } catch (err) {
      setError(extractMessage(err, 'Failed to send OTP'))
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const res = await verifyLoginOtp(identifier, otp)
      const data = extractResult(res.data)
      const token = data?.token || data?.accessToken || res.data?.token
      if (!token) {
        setError('Login response did not contain a token')
        return
      }
      login(token)
      navigate('/')
    } catch (err) {
      setError(extractMessage(err, 'OTP verification failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="brand brand-center">
          <span className="brand-dot">RT</span>
          <div>
            <strong>RightTouch</strong>
            <small>Technician Login</small>
          </div>
        </div>

        {step === 1 && (
          <form onSubmit={sendOtp}>
            <Field label="Mobile Number">
              <input
                required
                type="tel"
                placeholder="+919812345678"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </Field>
            <Alert type="error">{error}</Alert>
            <Button loading={loading} type="submit">
              Send OTP
            </Button>
            <div className="auth-links">
              <a href="/signup" className="link">
                New technician? Sign up
              </a>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={verifyOtp}>
            <Alert type="success">{message}</Alert>
            <Field label="OTP">
              <input
                required
                type="text"
                placeholder="Enter OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            </Field>
            <Alert type="error">{error}</Alert>
            <Button loading={loading} type="submit">
              Verify OTP
            </Button>
            <div className="auth-links">
              <button type="button" className="link" onClick={() => setStep(1)}>
                Back / resend OTP
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

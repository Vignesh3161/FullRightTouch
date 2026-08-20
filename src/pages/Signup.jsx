import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { sendSignupOtp, verifySignupOtp } from '../api/endpoints'
import { extractResult } from '../utils/helpers'
import { extractMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import Alert from '../components/Alert'
import Button from '../components/Button'
import Field from '../components/Field'

export default function Signup() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [step, setStep] = useState(1)
  const [identifier, setIdentifier] = useState('')
  const [termsAndServices, setTermsAndServices] = useState(false)
  const [privacyPolicy, setPrivacyPolicy] = useState(false)
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const sendOtp = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    if (!termsAndServices || !privacyPolicy) {
      setError('Please accept the Terms of Services and Privacy Policy')
      return
    }
    setLoading(true)
    try {
      await sendSignupOtp(identifier, termsAndServices, privacyPolicy)
      setMessage('OTP sent successfully. Enter the OTP to verify.')
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
      const res = await verifySignupOtp(identifier, otp)
      const data = extractResult(res.data)
      const token = data?.token || data?.accessToken || res.data?.token
      if (token) {
        login(token)
        navigate('/profile')
        return
      }
      setMessage('OTP verified. Please complete your profile.')
      setStep(3)
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
            <small>Technician Signup</small>
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
            <label className="checkbox">
              <input
                type="checkbox"
                checked={termsAndServices}
                onChange={(e) => setTermsAndServices(e.target.checked)}
              />
              I accept the Terms of Services
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={privacyPolicy}
                onChange={(e) => setPrivacyPolicy(e.target.checked)}
              />
              I accept the Privacy Policy
            </label>
            <Alert type="error">{error}</Alert>
            <Button loading={loading} type="submit">
              Send OTP
            </Button>
            <div className="auth-links">
              <a href="/login" className="link">
                Already have an account? Login
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

        {step === 3 && (
          <div>
            <Alert type="success">Signup successful. Please complete your profile to start working.</Alert>
            <Button onClick={() => navigate('/profile')}>Complete Profile</Button>
          </div>
        )}
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import {
  submitKyc,
  uploadKycDocuments,
  submitBankDetails,
  getKycStatus,
  getMyAccount
} from '../api/endpoints'
import { extractMessage } from '../api/client'
import { extractResult, formatDate, toText } from '../utils/helpers'
import { validateForm, validateFile } from '../utils/kycValidation'
import Card from '../components/Card'
import Field from '../components/Field'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Alert from '../components/Alert'

const IDENTITY_FIELDS = ['aadhaarNumber', 'panNumber', 'drivingLicenseNumber']
const BANK_FIELDS = [
  'accountHolderName',
  'bankName',
  'accountNumber',
  'ifscCode',
  'branchName',
  'upiId'
]

const EMPTY_IDENTITY = { aadhaarNumber: '', panNumber: '', drivingLicenseNumber: '' }
const EMPTY_BANK = {
  accountHolderName: '',
  bankName: '',
  accountNumber: '',
  ifscCode: '',
  branchName: '',
  upiId: ''
}
const EMPTY_FILES = {
  aadhaarFront: null,
  aadhaarBack: null,
  panImage: null,
  dlImage: null
}

const STEPS = [
  { key: 'identityComplete', label: 'Identity' },
  { key: 'documentsComplete', label: 'Documents' },
  { key: 'bankComplete', label: 'Bank' },
  { key: 'approved', label: 'Approval' }
]

export default function Kyc() {
  const [status, setStatus] = useState(null)
  const [identity, setIdentity] = useState(EMPTY_IDENTITY)
  const [bank, setBank] = useState(EMPTY_BANK)
  const [files, setFiles] = useState(EMPTY_FILES)
  const [errors, setErrors] = useState({})
  const [fileErrors, setFileErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const prefillBank = useCallback((bd) => {
    if (!bd) return
    setBank((prev) => ({
      accountHolderName: prev.accountHolderName || bd.accountHolderName || '',
      bankName: prev.bankName || bd.bankName || '',
      accountNumber: prev.accountNumber || bd.accountNumber || '',
      ifscCode: prev.ifscCode || bd.ifscCode || '',
      branchName: prev.branchName || bd.branchName || '',
      upiId: prev.upiId || bd.upiId || ''
    }))
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    getKycStatus()
      .then((res) => {
        const st = extractResult(res.data)
        setStatus(st)
        prefillBank(st?.bankDetails || st?.bank)
        if (st) {
          setIdentity((prev) => ({
            aadhaarNumber: prev.aadhaarNumber || st.aadhaarNumber || '',
            panNumber: prev.panNumber || st.panNumber || '',
            drivingLicenseNumber: prev.drivingLicenseNumber || st.drivingLicenseNumber || ''
          }))
        }
      })
      .catch(() => {})
      .then(() => getMyAccount())
      .then((res) => {
        const acc = extractResult(res.data)
        prefillBank(acc?.bankDetails || acc?.bank)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [prefillBank])

  useEffect(() => {
    load()
  }, [load])

  const run = async (key, fn) => {
    setSubmitting(key)
    setError('')
    setMessage('')
    try {
      const res = await fn()
      setMessage(res?.data?.message || 'Saved successfully')
      load()
      return true
    } catch (err) {
      setError(extractMessage(err, 'Request failed'))
      return false
    } finally {
      setSubmitting('')
    }
  }

  const handleIdentity = (e) => {
    e.preventDefault()
    const errs = validateForm(identity, IDENTITY_FIELDS)
    setErrors(errs)
    if (Object.keys(errs).length) return
    const payload = {
      aadhaarNumber: identity.aadhaarNumber.trim(),
      panNumber: identity.panNumber.trim().toUpperCase(),
      drivingLicenseNumber: identity.drivingLicenseNumber.trim()
    }
    run('identity', () => submitKyc(payload))
  }

  const handleBank = (e) => {
    e.preventDefault()
    const errs = validateForm(bank, BANK_FIELDS)
    setErrors(errs)
    if (Object.keys(errs).length) return
    const payload = {
      accountHolderName: bank.accountHolderName.trim(),
      bankName: bank.bankName.trim(),
      accountNumber: bank.accountNumber.trim(),
      ifscCode: bank.ifscCode.trim().toUpperCase(),
      branchName: bank.branchName.trim(),
      upiId: bank.upiId.trim()
    }
    run('bank', () => submitBankDetails(payload))
  }

  const onFileChange = (key) => (e) => {
    const file = e.target.files[0]
    const err = validateFile(file)
    setFileErrors((prev) => ({ ...prev, [key]: err }))
    setFiles((prev) => ({ ...prev, [key]: err ? null : file }))
    if (err) e.target.value = ''
  }

  const handleUpload = (e) => {
    e.preventDefault()
    const hasFiles = Object.values(files).some(Boolean)
    if (!hasFiles) {
      setFileErrors({ all: 'Select at least one document image to upload' })
      return
    }
    const fd = new FormData()
    if (files.aadhaarFront) fd.append('aadhaarImage', files.aadhaarFront)
    if (files.aadhaarBack) fd.append('aadhaarImage', files.aadhaarBack)
    if (files.panImage) fd.append('panImage', files.panImage)
    if (files.dlImage) fd.append('dlImage', files.dlImage)
    run('documents', () => uploadKycDocuments(fd)).then((ok) => {
      if (ok) setFiles(EMPTY_FILES)
    })
  }

  const statusKey = (key) => key === 'approved' ? status?.approvalStatus === 'approved' : !!status?.[key]
  const doneCount = STEPS.filter((s) => statusKey(s.key)).length
  const eligible = !!status?.eligible
  const rejectionReason = status?.bankRejectionReason || status?.rejectionReason
  const uploadedCounts = {
    aadhaar: toText(status?.aadhaarImages?.length),
    pan: toText(status?.panImages?.length),
    dl: toText(status?.dlImages?.length)
  }
  const bankVerified = status?.bankVerified ?? status?.bankDetails?.bankVerified
  const identityErr = (name) => errors[name]
  const bankErr = (name) => errors[name]

  return (
    <div>
      <h2>KYC & Bank Verification</h2>
      <Alert type="error">{error}</Alert>
      <Alert type="success">{message}</Alert>

      <Card title="Workflow">
        <div className="kyc-steps">
          {STEPS.map((s, i) => {
            const done = statusKey(s.key)
            const active = !done && i === doneCount
            return (
              <div key={s.key} className={`kyc-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                <span className="kyc-step-dot">{done ? '✓' : i + 1}</span>
                <small>{s.label}</small>
              </div>
            )
          })}
        </div>

        {loading ? (
          <p className="muted">Loading KYC status...</p>
        ) : eligible ? (
          <div className="banner banner-success">
            <strong>✓ Eligible for jobs & payouts</strong>
            <span>Your identity and bank details are verified.</span>
          </div>
        ) : status ? (
          <div
            className={`banner ${
              status.approvalStatus === 'rejected'
                ? 'banner-danger'
                : status.needsReVerification
                  ? 'banner-warning'
                  : 'banner-info'
            }`}
          >
            <strong>
              {status.approvalStatus === 'rejected'
                ? 'KYC rejected'
                : status.needsReVerification
                  ? 'Re-verification required'
                  : 'KYC in progress'}
            </strong>
            <span>
              {rejectionReason
                ? `Reason: ${rejectionReason}`
                : status.needsReVerification
                  ? 'Bank details changed recently and are pending re-verification.'
                  : 'Complete all steps below to become eligible for jobs and payouts.'}
            </span>
          </div>
        ) : (
          <p className="muted">No KYC record yet — submit your details below to get started.</p>
        )}

        {status && (
          <ul className="checklist">
            <li className={status.identityComplete ? 'done' : ''}>
              <span className="tick">{status.identityComplete ? '✓' : '•'}</span>
              Identity submitted
              <Badge status={status.approvalStatus} />
            </li>
            <li className={status.documentsComplete ? 'done' : ''}>
              <span className="tick">{status.documentsComplete ? '✓' : '•'}</span>
              Documents uploaded
            </li>
            <li className={status.bankComplete ? 'done' : ''}>
              <span className="tick">{status.bankComplete ? '✓' : '•'}</span>
              Bank details verified
              {bankVerified != null && <Badge status={bankVerified ? 'verified' : 'unverified'} />}
            </li>
          </ul>
        )}
      </Card>

      <div className="grid-2">
        <Card title="1. Identity — Submit / Update KYC">
          <form onSubmit={handleIdentity}>
            <Field label="Aadhaar Number">
              <input
                className={identityErr('aadhaarNumber') ? 'field-error' : ''}
                value={identity.aadhaarNumber}
                onChange={(e) => setIdentity({ ...identity, aadhaarNumber: e.target.value })}
                placeholder="12 digit Aadhaar number"
                inputMode="numeric"
                maxLength={12}
              />
              {identityErr('aadhaarNumber') && <p className="error-text">{identityErr('aadhaarNumber')}</p>}
            </Field>
            <Field label="PAN Number">
              <input
                className={identityErr('panNumber') ? 'field-error' : ''}
                value={identity.panNumber}
                onChange={(e) => setIdentity({ ...identity, panNumber: e.target.value })}
                placeholder="ABCDE1234F"
                style={{ textTransform: 'uppercase' }}
                maxLength={10}
              />
              {identityErr('panNumber') && <p className="error-text">{identityErr('panNumber')}</p>}
            </Field>
            <Field label="Driving License Number">
              <input
                className={identityErr('drivingLicenseNumber') ? 'field-error' : ''}
                value={identity.drivingLicenseNumber}
                onChange={(e) => setIdentity({ ...identity, drivingLicenseNumber: e.target.value })}
                placeholder="DL-0420110149646"
              />
              {identityErr('drivingLicenseNumber') && (
                <p className="error-text">{identityErr('drivingLicenseNumber')}</p>
              )}
            </Field>
            <Button loading={submitting === 'identity'} type="submit">
              Submit KYC
            </Button>
            <p className="muted form-note">
              Values are encrypted (AES-256-GCM) at rest. Only you can view your full details.
            </p>
          </form>
        </Card>

        <Card
          title="2. Documents — Upload Images"
          actions={
            status && (
              <small className="muted">
                Aadhaar {uploadedCounts.aadhaar}/2 · PAN {uploadedCounts.pan}/2 · DL {uploadedCounts.dl}/2
              </small>
            )
          }
        >
          <form onSubmit={handleUpload}>
            <Field label="Aadhaar Front">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onFileChange('aadhaarFront')}
              />
              {fileErrors.aadhaarFront && <p className="error-text">{fileErrors.aadhaarFront}</p>}
            </Field>
            <Field label="Aadhaar Back">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onFileChange('aadhaarBack')}
              />
              {fileErrors.aadhaarBack && <p className="error-text">{fileErrors.aadhaarBack}</p>}
            </Field>
            <Field label="PAN Image">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onFileChange('panImage')}
              />
              {fileErrors.panImage && <p className="error-text">{fileErrors.panImage}</p>}
            </Field>
            <Field label="Driving License Image">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onFileChange('dlImage')}
              />
              {fileErrors.dlImage && <p className="error-text">{fileErrors.dlImage}</p>}
            </Field>
            {fileErrors.all && <Alert type="error">{fileErrors.all}</Alert>}
            <Button loading={submitting === 'documents'} type="submit">
              Upload Documents
            </Button>
            <p className="muted form-note">JPEG / PNG / WEBP only, max 5 MB per file.</p>
          </form>
        </Card>
      </div>

      <Card title="3. Bank Details — for Payouts">
        <form onSubmit={handleBank}>
          <div className="grid-3">
            <Field label="Account Holder Name">
              <input
                className={bankErr('accountHolderName') ? 'field-error' : ''}
                value={bank.accountHolderName}
                onChange={(e) => setBank({ ...bank, accountHolderName: e.target.value })}
              />
              {bankErr('accountHolderName') && (
                <p className="error-text">{bankErr('accountHolderName')}</p>
              )}
            </Field>
            <Field label="Bank Name">
              <input
                className={bankErr('bankName') ? 'field-error' : ''}
                value={bank.bankName}
                onChange={(e) => setBank({ ...bank, bankName: e.target.value })}
              />
              {bankErr('bankName') && <p className="error-text">{bankErr('bankName')}</p>}
            </Field>
            <Field label="Account Number">
              <input
                className={bankErr('accountNumber') ? 'field-error' : ''}
                value={bank.accountNumber}
                onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })}
                inputMode="numeric"
                maxLength={18}
              />
              {bankErr('accountNumber') && <p className="error-text">{bankErr('accountNumber')}</p>}
            </Field>
            <Field label="IFSC Code">
              <input
                className={bankErr('ifscCode') ? 'field-error' : ''}
                value={bank.ifscCode}
                onChange={(e) => setBank({ ...bank, ifscCode: e.target.value })}
                placeholder="SBIN0001234"
                style={{ textTransform: 'uppercase' }}
                maxLength={11}
              />
              {bankErr('ifscCode') && <p className="error-text">{bankErr('ifscCode')}</p>}
            </Field>
            <Field label="Branch Name">
              <input
                className={bankErr('branchName') ? 'field-error' : ''}
                value={bank.branchName}
                onChange={(e) => setBank({ ...bank, branchName: e.target.value })}
              />
              {bankErr('branchName') && <p className="error-text">{bankErr('branchName')}</p>}
            </Field>
            <Field label="UPI ID">
              <input
                className={bankErr('upiId') ? 'field-error' : ''}
                value={bank.upiId}
                onChange={(e) => setBank({ ...bank, upiId: e.target.value })}
                placeholder="name@bank"
              />
              {bankErr('upiId') && <p className="error-text">{bankErr('upiId')}</p>}
            </Field>
          </div>
          <Button loading={submitting === 'bank'} type="submit">
            Submit Bank Details
          </Button>
          <p className="muted form-note">
            {bankVerified != null && (
              <>
                Current status: <Badge status={bankVerified ? 'verified' : 'unverified'} /> ·{' '}
              </>
            )}
            Re-submitting the same account triggers re-verification.
          </p>
        </form>
      </Card>

      <Card title="My KYC Status">
        {status ? (
          <table className="table">
            <tbody>
              <tr>
                <td>Approval Status</td>
                <td>
                  <Badge status={status.approvalStatus} />
                </td>
              </tr>
              <tr>
                <td>Aadhaar Number</td>
                <td>{toText(status.aadhaarNumber) || '-'}</td>
              </tr>
              <tr>
                <td>PAN</td>
                <td>{toText(status.panNumber) || '-'}</td>
              </tr>
              <tr>
                <td>Driving License</td>
                <td>{toText(status.drivingLicenseNumber) || '-'}</td>
              </tr>
              <tr>
                <td>Bank Account</td>
                <td>
                  {toText(bank.accountNumber)
                    ? `${bank.accountNumber} · ${bank.bankName} (${bank.ifscCode})`
                    : '-'}
                </td>
              </tr>
              <tr>
                <td>Bank Verified</td>
                <td>{bankVerified != null ? <Badge status={bankVerified ? 'verified' : 'unverified'} /> : '-'}</td>
              </tr>
              <tr>
                <td>Re-verification Needed</td>
                <td>{status.needsReVerification ? 'Yes' : 'No'}</td>
              </tr>
              <tr>
                <td>Last Updated</td>
                <td>{formatDate(status.updatedAt)}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="muted">No KYC record found.</p>
        )}
      </Card>
    </div>
  )
}

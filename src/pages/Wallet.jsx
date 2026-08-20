import { useEffect, useState } from 'react'
import {
  getWalletBalance,
  getWalletTransactions,
  requestWithdrawal,
  getWithdrawalHistory,
  cancelWithdrawal,
  getEarningsSummary,
  updatePayoutSettings
} from '../api/endpoints'
import { extractResult, formatCurrency, formatDate, toText } from '../utils/helpers'
import { extractMessage } from '../api/client'
import { useSocket } from '../context/SocketContext'
import Card from '../components/Card'
import Field from '../components/Field'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Alert from '../components/Alert'

export default function Wallet() {
  const { paymentReceived } = useSocket()
  const [balance, setBalance] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [earnings, setEarnings] = useState(null)
  const [amount, setAmount] = useState('')
  const [page, setPage] = useState(1)
  const [payout, setPayout] = useState({
    autoPayoutEnabled: false,
    autoPayoutThreshold: '',
    minimumMaintenance: '',
    preferredPayoutMode: 'UPI'
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const [b, t, w, e] = await Promise.all([
        getWalletBalance(),
        getWalletTransactions(page, 20),
        getWithdrawalHistory(),
        getEarningsSummary()
      ])
      console.log('=== WALLET API RESPONSES ===')
      console.log('Wallet Balance:', b.data)
      console.log('Wallet Transactions:', t.data)
      console.log('Withdrawal History:', w.data)
      console.log('Earnings Summary:', e.data)
      console.log('=== EXTRACTED ===')
      console.log('Balance extracted:', extractResult(b.data))
      console.log('Transactions extracted:', extractResult(t.data))
      console.log('Withdrawals extracted:', extractResult(w.data))
      setBalance(extractResult(b.data))
      setEarnings(extractResult(e.data))
      const tx = extractResult(t.data)
      setTransactions(Array.isArray(tx) ? tx : tx?.transactions || tx?.docs || [])
      setWithdrawals(extractResult(w.data) || [])
    } catch (err) {
      console.error('Wallet load error:', err)
      setError(extractMessage(err, 'Could not load wallet'))
    }
  }

  useEffect(() => {
    load()
  }, [page])

  useEffect(() => {
    if (paymentReceived) {
      load()
    }
  }, [paymentReceived])
  
  const withdraw = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      console.log('=== WITHDRAWAL REQUEST ===')
      console.log('Amount:', amount)
      const res = await requestWithdrawal(Number(amount))
      console.log('Withdrawal response:', res.data)
      setMessage('Withdrawal requested')
      setAmount('')
      await load()
    } catch (err) {
      console.error('Withdrawal error:', err)
      setError(extractMessage(err, 'Could not request withdrawal'))
    } finally {
      setLoading(false)
    }
  }

  const cancel = async (id) => {
    if (!id) return
    if (!window.confirm('Cancel this withdrawal request?')) return
    setError('')
    setMessage('')
    setLoading(true)
    try {
      console.log('=== CANCEL WITHDRAWAL ===', id)
      const res = await cancelWithdrawal(id)
      console.log('Cancel response:', res.data)
      setMessage('Withdrawal request cancelled')
      await load()
    } catch (err) {
      console.error('Cancel error:', err)
      setError(extractMessage(err, 'Could not cancel withdrawal'))
    } finally {
      setLoading(false)
    }
  }

  const savePayoutSettings = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const res = await updatePayoutSettings({
        autoPayoutEnabled: payout.autoPayoutEnabled,
        autoPayoutThreshold: payout.autoPayoutThreshold ? Number(payout.autoPayoutThreshold) : undefined,
        minimumMaintenance: payout.minimumMaintenance ? Number(payout.minimumMaintenance) : undefined,
        preferredPayoutMode: payout.preferredPayoutMode
      })
      console.log('Payout settings response:', res.data)
      setMessage(extractResult(res.data)?.message || 'Payout settings updated')
    } catch (err) {
      setError(extractMessage(err, 'Could not update payout settings'))
    } finally {
      setLoading(false)
    }
  }

  const pendingCount = Array.isArray(withdrawals)
  ? withdrawals.filter((w) => (w.status || 'pending') === 'pending').length
  : 0
  
  return (
    <div>
      <h2>Wallet</h2>
      <Alert type="error">{error}</Alert>
      <Alert type="success">{message}</Alert>

      {paymentReceived && (
        <Alert type="success">
          Payment of {formatCurrency(paymentReceived.amount)} received for booking {toText(paymentReceived.bookingId)}
        </Alert>
      )}

      <div className="grid">
        <div className="stat stat-accent">
          <small>Wallet Balance</small>
          <strong>{balance ? formatCurrency(balance.balance ?? balance.amount ?? 0) : '-'}</strong>
        </div>
        <div className="stat">
          <small>Pending Withdrawals</small>
          <strong>{pendingCount}</strong>
        </div>
      </div>

      <Card title="Earnings Summary">
        {earnings ? (
          <div className="grid-2">
            <div className="stat">
              <small>Total Earnings</small>
              <strong>{formatCurrency(earnings.totalEarnings ?? 0)}</strong>
            </div>
            <div className="stat">
              <small>Total Tips</small>
              <strong>{formatCurrency(earnings.totalTips ?? 0)}</strong>
            </div>
            <div className="stat">
              <small>Withdrawn</small>
              <strong>{formatCurrency(earnings.withdrawnAmount ?? 0)}</strong>
            </div>
            <div className="stat">
              <small>Pending Withdrawals</small>
              <strong>{formatCurrency(earnings.pendingWithdrawals?.amount ?? earnings.pendingWithdrawals ?? 0)}</strong>
            </div>
            <div className="stat">
              <small>Current Balance</small>
              <strong>{formatCurrency(earnings.currentBalance ?? 0)}</strong>
            </div>
          </div>
        ) : (
          <p className="muted">Earnings summary not available.</p>
        )}
      </Card>

      <div className="grid-2">
        <Card title="Request Withdrawal">
          <form onSubmit={withdraw}>
            <Field label="Amount (₹)">
              <input
                required
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Button loading={loading} type="submit">
              Request Withdrawal
            </Button>
          </form>
        </Card>

        <Card title="Withdrawal History">
          {withdrawals.length === 0 ? (
            <p className="muted">No withdrawals yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w, i) => (
                  <tr key={toText(w._id || w.id) || `wd-${i}`}>
                    <td>{formatCurrency(w.amount)}</td>
                    <td>
                      <Badge status={w.status} />
                    </td>
                    <td>{formatDate(w.createdAt || w.requestedAt)}</td>
                    <td>
                      {(toText(w.status) === 'pending' || !toText(w.status)) && (
                        <Button
                          loading={loading}
                          className="btn-small"
                          onClick={() => cancel(toText(w._id || w.id))}
                        >
                          Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card title="Payout Settings (Auto-Payout)">
        <form onSubmit={savePayoutSettings}>
          <label className="checkbox" style={{ marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={payout.autoPayoutEnabled}
              onChange={(e) => setPayout({ ...payout, autoPayoutEnabled: e.target.checked })}
            />
            Enable auto-payout
          </label>
          <div className="grid-3">
            <Field label="Auto-Payout Threshold (₹)">
              <input
                type="number"
                min="0"
                placeholder="e.g. 5000"
                value={payout.autoPayoutThreshold}
                onChange={(e) => setPayout({ ...payout, autoPayoutThreshold: e.target.value })}
              />
            </Field>
            <Field label="Minimum Maintenance (₹)">
              <input
                type="number"
                min="0"
                placeholder="e.g. 100"
                value={payout.minimumMaintenance}
                onChange={(e) => setPayout({ ...payout, minimumMaintenance: e.target.value })}
              />
            </Field>
            <Field label="Preferred Payout Mode">
              <select
                value={payout.preferredPayoutMode}
                onChange={(e) => setPayout({ ...payout, preferredPayoutMode: e.target.value })}
              >
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="NEFT">NEFT</option>
                <option value="IMPS">IMPS</option>
              </select>
            </Field>
          </div>
          <Button loading={loading} type="submit">
            Save Payout Settings
          </Button>
        </form>
      </Card>

      <Card title="Transactions">
        {transactions.length === 0 ? (
          <p className="muted">No transactions yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={toText(t._id || t.id)}>
                  <td>{toText(t.type || t.transactionType) || '-'}</td>
                  <td>{toText(t.description || t.note || t.purpose) || '-'}</td>
                  <td>{formatCurrency(t.amount)}</td>
                  <td>{formatDate(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="pagination">
          <Button className="btn-small btn-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Prev
          </Button>
          <span>Page {page}</span>
          <Button className="btn-small btn-outline" disabled={transactions.length < 20} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      </Card>
    </div>
  )
}

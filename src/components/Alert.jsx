export default function Alert({ type, children }) {
  if (!children) return null
  const cls = type === 'error' ? 'alert-error' : type === 'success' ? 'alert-success' : 'alert-info'
  return <div className={`alert ${cls}`}>{children}</div>
}

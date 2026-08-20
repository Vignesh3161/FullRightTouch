export default function Button({ loading, children, ...props }) {
  return (
    <button className="btn" disabled={loading || props.disabled} {...props}>
      {loading ? 'Please wait...' : children}
    </button>
  )
}

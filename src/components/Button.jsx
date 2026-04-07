import './Button.css'

export function Button({ children, variant = 'ghost', onClick, className = '', disabled, ...props }) {
  return (
    <button
      className={`btn btn-${variant} ${className}`}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}

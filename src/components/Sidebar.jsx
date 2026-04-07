import { useNavigate, useLocation } from 'react-router-dom'
import { LogoIcon, ProductsIcon, AccountsIcon, CalendarIcon } from './Icons'
import './Sidebar.css'

const navItems = [
  { label: 'Products', path: '/products', Icon: ProductsIcon },
  { label: 'Accounts', path: '/accounts', Icon: AccountsIcon },
  { label: 'Calendar', path: '/calendar', Icon: CalendarIcon },
]

export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + '/')

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark" onClick={() => navigate('/products')} style={{ cursor: 'pointer' }}>
          <div className="logo-icon">
            <LogoIcon size={15} />
          </div>
          <span className="logo-text">Social<span>Amp</span></span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(({ label, path, Icon }) => (
          <div
            key={path}
            className={`nav-item${isActive(path) ? ' nav-item-active' : ''}`}
            onClick={() => navigate(path)}
          >
            <span className="nav-item-icon"><Icon size={15} /></span>
            <span className="nav-item-label">{label}</span>
          </div>
        ))}
      </nav>
    </aside>
  )
}

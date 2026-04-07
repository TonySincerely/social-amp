import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { SettingsIcon } from './Icons'
import './Topbar.css'

const pageTitles = {
  '/products': 'Products',
  '/accounts': 'Accounts',
  '/calendar': 'Calendar',
  '/planner': 'Calendar Planner',
}

export function Topbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { setShowApiKeyModal } = useApp()

  const title = pageTitles[location.pathname]
    || (location.pathname.startsWith('/studio') ? 'Content Studio' : 'Social Amp')


  return (
    <div className="topbar">
      <strong className="topbar-title">{title}</strong>
      <div className="topbar-actions">
        <button
          className="topbar-btn"
          onClick={() => setShowApiKeyModal(true)}
          title="Change API key"
        >
          <SettingsIcon size={14} />
        </button>
      </div>
    </div>
  )
}

import { useLocation } from 'react-router-dom'
import './Topbar.css'

const pageTitles = {
  '/products': 'Products',
  '/accounts': 'Accounts',
  '/calendar': 'Calendar',
  '/planner': 'Calendar Planner',
  '/pulse': 'Pulse',
  '/playbook': 'Playbook',
  '/scraper': 'Scraper',
  '/booster': 'Booster',
}

export function Topbar() {
  const location = useLocation()
  const title = pageTitles[location.pathname]
    || (location.pathname.startsWith('/studio') ? 'Content Studio' : 'Social Amp')

  return (
    <div className="topbar">
      <strong className="topbar-title">{title}</strong>
    </div>
  )
}

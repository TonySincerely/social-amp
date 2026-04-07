import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { ApiKeyModal } from './ApiKeyModal'
import { useApp } from '../context/AppContext'
import './Layout.css'

export function Layout() {
  const { showApiKeyModal } = useApp()

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Topbar />
        <div className="content">
          <Outlet />
        </div>
      </div>
      {showApiKeyModal && <ApiKeyModal />}
    </div>
  )
}

import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { QuickCreateDrawer } from './QuickCreateDrawer'
import './Layout.css'

export function Layout() {
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Topbar />
        <div className="content">
          <Outlet />
        </div>
      </div>
      <QuickCreateDrawer />
    </div>
  )
}

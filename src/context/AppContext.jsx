import { createContext, useContext, useState } from 'react'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [showQuickCreate, setShowQuickCreate] = useState(false)
  const [quickCreateDate, setQuickCreateDate] = useState(null)

  return (
    <AppContext.Provider value={{ showQuickCreate, setShowQuickCreate, quickCreateDate, setQuickCreateDate }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

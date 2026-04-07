import { createContext, useContext, useState, useEffect } from 'react'
import { initGemini, getStoredApiKey, isGeminiInitialized } from '../services/gemini'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [apiKeySet, setApiKeySet] = useState(false)
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)

  useEffect(() => {
    const key = getStoredApiKey()
    if (key) {
      initGemini(key)
      setApiKeySet(true)
    }
  }, [])

  function onApiKeySaved() {
    setApiKeySet(isGeminiInitialized())
    setShowApiKeyModal(false)
  }

  return (
    <AppContext.Provider value={{ apiKeySet, showApiKeyModal, setShowApiKeyModal, onApiKeySaved }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

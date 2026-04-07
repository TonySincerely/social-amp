import { useState } from 'react'
import { setApiKey } from '../services/gemini'
import { useApp } from '../context/AppContext'
import './ApiKeyModal.css'

export function ApiKeyModal() {
  const { onApiKeySaved } = useApp()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  function handleSave() {
    const trimmed = value.trim()
    if (!trimmed) { setError('API key is required'); return }
    if (!trimmed.startsWith('AI')) { setError('That doesn\'t look like a Google AI Studio key'); return }
    setApiKey(trimmed)
    onApiKeySaved()
  }

  return (
    <div className="apikey-overlay">
      <div className="apikey-card">
        <div className="apikey-header">
          <h2>Enter Gemini API Key</h2>
          <p>Get a free key at <strong>aistudio.google.com</strong>. It's stored locally and never sent anywhere except Google's API.</p>
        </div>
        <div className="apikey-body">
          <input
            type="password"
            placeholder="AIza..."
            value={value}
            onChange={e => { setValue(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            autoFocus
          />
          {error && <div className="apikey-error">{error}</div>}
        </div>
        <div className="apikey-footer">
          <button className="btn btn-primary" onClick={handleSave}>Save key</button>
        </div>
      </div>
    </div>
  )
}

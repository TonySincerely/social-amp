import { useState } from 'react'
import { ThreadsScraper } from './ThreadsScraper'
import './Scraper.css'

const TABS = [{ id: 'threads', label: 'Threads' }]

export function Scraper() {
  const [activeTab, setActiveTab] = useState('threads')

  return (
    <div className="sc-wrap">
      <div className="sc-header">
        <div>
          <h1 className="sc-title">Scraper</h1>
          <p className="sc-subtitle">Collect and monitor posts from social feeds</p>
        </div>
        <div className="sc-tab-bar">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`sc-tab${activeTab === t.id ? ' sc-tab-active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {activeTab === 'threads' && <ThreadsScraper />}
    </div>
  )
}

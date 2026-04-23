import { useState } from 'react'
import { ThreadsScraper } from './ThreadsScraper'
import { TwitterScraper } from './TwitterScraper'
import './Scraper.css'

const TABS = [
  { id: 'threads', label: 'Threads' },
  { id: 'twitter', label: 'Twitter / X' },
]

export function Scraper() {
  const [activeTab, setActiveTab] = useState('threads')

  return (
    <div className="sc-wrap">
      <div className="sc-header">
        <div>
          <h1 className="sc-title">Scraper</h1>
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
      {activeTab === 'twitter' && <TwitterScraper />}
    </div>
  )
}

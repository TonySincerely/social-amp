import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getAllCalendarPosts, deleteCalendarPost, updateCalendarPost } from '../../services/storage'
import { PlatformBadge, TrashIcon } from '../../components/Icons'
import { formatTime12 } from '../../services/planner'
import { useApp } from '../../context/AppContext'
import './Calendar.css'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export function Calendar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setShowQuickCreate, setQuickCreateDate } = useApp()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [posts, setPosts] = useState([])
  const [selectedPost, setSelectedPost] = useState(null)

  useEffect(() => {
    getAllCalendarPosts().then(all => {
      setPosts(all)
      // If navigated back from planner, jump to the planned month
      if (location.state?.plannedMonth !== undefined) {
        setMonth(location.state.plannedMonth)
        setYear(location.state.plannedYear ?? now.getFullYear())
      }
    })
  }, [])

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthPosts = posts.filter(p => p.monthKey === monthKey)

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this post?')) return
    await deleteCalendarPost(id)
    setPosts(prev => prev.filter(p => p.id !== id))
    setSelectedPost(null)
  }

  function handleWriteInStudio(post) {
    navigate(`/studio/${post.productId}`, {
      state: {
        slotId: post.id,
        date: post.date,
        angle: post.angle || '',
        accountId: post.accountId,
      },
    })
  }

  function handleEditInStudio(post) {
    navigate(`/studio/${post.productId}`, {
      state: {
        prefillPost: {
          postId: post.id,
          copy: post.copy,
          angle: post.angle || '',
          identity: post.identity || 'random_guy',
          postTone: post.postTone || 'promoting',
          accountId: post.accountId,
          date: post.date,
        },
      },
    })
  }

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  function postsForDay(day) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return monthPosts.filter(p => p.date === dateStr)
  }

  const draftCount = monthPosts.filter(p => p.status === 'draft').length
  const readyCount = monthPosts.filter(p => p.status !== 'draft').length

  return (
    <div className="cal-wrap">
      <div className="cal-header">
        <div>
          <h1 className="cal-title">Calendar</h1>
          <p className="cal-subtitle">
            {monthPosts.length === 0
              ? 'No posts this month.'
              : `${readyCount} ready · ${draftCount} draft${draftCount !== 1 ? 's' : ''}`
            }
          </p>
        </div>
        <div className="cal-header-right">
          <button
            className="btn btn-purple"
            onClick={() => navigate('/planner')}
          >
            Plan month
          </button>
          <div className="cal-nav">
            <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
            <span className="cal-month-label">{MONTHS[month]} {year}</span>
            <button className="cal-nav-btn" onClick={nextMonth}>›</button>
          </div>
        </div>
      </div>

      <div className="cal-grid-wrap">
        <div className="cal-day-headers">
          {DAYS.map(d => <div key={d} className="cal-day-header">{d}</div>)}
        </div>

        <div className="cal-grid">
          {cells.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} className="cal-cell cal-cell-empty" />
            const dayPosts = postsForDay(day)
            const today = now.getFullYear() === year && now.getMonth() === month && now.getDate() === day
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            return (
              <div
                key={day}
                className={`cal-cell cal-cell-clickable${today ? ' cal-cell-today' : ''}`}
                onClick={() => { setQuickCreateDate(dateStr); setShowQuickCreate(true) }}
              >
                <div className="cal-cell-day">{day}</div>
                <div className="cal-cell-posts">
                  {dayPosts.slice(0, 3).map(p => (
                    <div
                      key={p.id}
                      className={`cal-post-chip${p.status === 'draft' ? ' draft' : ''}`}
                      onClick={e => { e.stopPropagation(); setSelectedPost(p) }}
                      title={p.status === 'draft' ? `Draft · @${p.accountHandle}` : p.copy?.slice(0, 80)}
                    >
                      <PlatformBadge platform={p.platform} size={9} />
                      <span className="cal-post-chip-text">@{p.accountHandle}</span>
                      {p.status === 'draft' && <span className="cal-draft-dot" />}
                    </div>
                  ))}
                  {dayPosts.length > 3 && (
                    <div className="cal-post-more" onClick={e => e.stopPropagation()}>+{dayPosts.length - 3} more</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Post/slot detail drawer */}
      {selectedPost && (
        <div className="cal-drawer-overlay" onClick={() => setSelectedPost(null)}>
          <div className="cal-drawer" onClick={e => e.stopPropagation()}>
            <div className="cal-drawer-header">
              <div className="cal-drawer-meta">
                <PlatformBadge platform={selectedPost.platform} size={13} />
                <span className="cal-drawer-handle">@{selectedPost.accountHandle}</span>
                <span className="cal-drawer-date">{selectedPost.date}</span>
                {selectedPost.time && (
                  <span className="cal-drawer-time">{formatTime12(selectedPost.time)}</span>
                )}
                {selectedPost.status === 'draft' && (
                  <span className="cal-drawer-draft-badge">draft</span>
                )}
              </div>
              <button className="ah-icon-btn" onClick={() => setSelectedPost(null)}>×</button>
            </div>

            <div className="cal-drawer-body">
              {selectedPost.angle && (
                <div className="cal-drawer-angle">Angle: {selectedPost.angle}</div>
              )}
              {selectedPost.status === 'draft' ? (
                <div className="cal-drawer-draft-msg">
                  No copy written yet. Open in the Content Studio to write and publish.
                </div>
              ) : (
                <div className="cal-drawer-copy">{selectedPost.copy}</div>
              )}
            </div>

            <div className="cal-drawer-footer">
              {selectedPost.status === 'draft' ? (
                <button
                  className="btn btn-purple"
                  onClick={() => handleWriteInStudio(selectedPost)}
                >
                  Write in Studio →
                </button>
              ) : (
                <button
                  className="btn btn-ghost"
                  onClick={() => handleEditInStudio(selectedPost)}
                >
                  Edit in Studio →
                </button>
              )}
              <button
                className="btn btn-danger"
                onClick={() => handleDelete(selectedPost.id)}
              >
                <TrashIcon size={12} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

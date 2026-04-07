import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllProducts, deleteProduct } from '../../services/storage'
import { PlusIcon, ChevronRightIcon, TrashIcon, EditIcon, PlatformBadge } from '../../components/Icons'
import './ProductList.css'

const STAGE_LABELS = { idea: 'Idea', prototype: 'Prototype', live: 'Live' }
const STAGE_COLORS = { idea: 'gold', prototype: 'purple', live: 'teal' }

export function ProductList() {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllProducts()
      .then(list => setProducts(list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))))
      .finally(() => setLoading(false))
  }, [])

  async function handleDelete(e, id) {
    e.stopPropagation()
    if (!confirm('Delete this product?')) return
    await deleteProduct(id)
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  function briefAge(fetchedAt) {
    if (!fetchedAt) return null
    const hours = (Date.now() - new Date(fetchedAt)) / 3_600_000
    if (hours < 1) return 'fresh'
    if (hours < 24) return `${Math.floor(hours)}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  if (loading) {
    return (
      <div className="pl-wrap">
        <div className="pl-loading"><div className="spinner" /></div>
      </div>
    )
  }

  return (
    <div className="pl-wrap">
      <div className="pl-header">
        <div>
          <h1 className="pl-title">Products</h1>
          <p className="pl-subtitle">Each product gets its own brief, accounts, and content queue.</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/products/new')}>
          <PlusIcon size={13} /> New product
        </button>
      </div>

      {products.length === 0 ? (
        <div className="pl-empty">
          <div className="pl-empty-icon">⚡</div>
          <div className="pl-empty-title">No products yet</div>
          <div className="pl-empty-desc">Create your first product to start generating social content.</div>
          <button className="btn btn-primary" onClick={() => navigate('/products/new')}>
            <PlusIcon size={13} /> Create product
          </button>
        </div>
      ) : (
        <div className="pl-grid">
          {products.map(p => (
            <div key={p.id} className="product-card">
              <div className="product-card-header">
                <div className="product-card-name">{p.name}</div>
                <span className={`stage-badge stage-${STAGE_COLORS[p.stage] || 'gold'}`}>
                  {STAGE_LABELS[p.stage] || 'Idea'}
                </span>
              </div>

              <div className="product-card-problem">{p.problemStatement}</div>

              <div className="product-card-meta">
                <div className="product-card-platforms">
                  {(p.platforms || []).map(pl => (
                    <PlatformBadge key={pl} platform={pl} size={12} />
                  ))}
                </div>
                {p.trendBrief?.fetchedAt && (
                  <span className={`brief-age ${briefAge(p.trendBrief.fetchedAt) === 'fresh' ? 'brief-fresh' : ''}`}>
                    Brief: {briefAge(p.trendBrief.fetchedAt)}
                  </span>
                )}
              </div>

              <div className="product-card-footer">
                <div className="product-card-left-actions">
                  <button
                    className="product-card-delete"
                    onClick={(e) => handleDelete(e, p.id)}
                    title="Delete product"
                  >
                    <TrashIcon size={13} />
                  </button>
                  <button
                    className="product-card-edit"
                    onClick={(e) => { e.stopPropagation(); navigate(`/products/${p.id}`) }}
                    title="Edit settings"
                  >
                    <EditIcon size={13} />
                  </button>
                </div>
                <button className="product-card-enter" onClick={(e) => { e.stopPropagation(); navigate(`/studio/${p.id}`) }}>
                  Enter Studio <ChevronRightIcon size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

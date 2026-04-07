import { Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { Layout } from './components'
import { ProductList, ProductSetup, AccountHub, ContentStudio, Calendar, Planner } from './views'

function App() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/products" replace />} />
          <Route path="products" element={<ProductList />} />
          <Route path="products/new" element={<ProductSetup />} />
          <Route path="products/:id" element={<ProductSetup />} />
          <Route path="studio/:productId" element={<ContentStudio />} />
          <Route path="accounts" element={<AccountHub />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="planner" element={<Planner />} />
        </Route>
      </Routes>
    </AppProvider>
  )
}

export default App

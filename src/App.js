// src/App.js
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginScreen from './screens/LoginScreen'
import ChecklistScreen from './screens/ChecklistScreen'
import ConfigScreen from './screens/ConfigScreen'

function PrivateRoute({ children, requireConfig }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'var(--font-sans)', color: 'var(--color-text-secondary)' }}>Carregando...</div>
  if (!user) return <Navigate to="/" replace />
  if (requireConfig && user.role === 'colaborador') return <Navigate to="/checklist" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginScreen />} />
          <Route path="/checklist" element={
            <PrivateRoute><ChecklistScreen /></PrivateRoute>
          } />
          <Route path="/config" element={
            <PrivateRoute requireConfig><ConfigScreen /></PrivateRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

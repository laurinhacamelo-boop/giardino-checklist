import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
const SESSION_KEY = 'giardino_session'
const SESSION_DURATION = 24 * 60 * 60 * 1000

async function sha256(text) {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY)
    if (saved) {
      try {
        const { data, expiresAt } = JSON.parse(saved)
        if (Date.now() < expiresAt) setUser(data)
        else localStorage.removeItem(SESSION_KEY)
      } catch {}
    }
    setLoading(false)
  }, [])

  async function login(colaboradorId, pin) {
    const { data, error } = await supabase
      .from('colaboradores')
      .select('*')
      .eq('id', colaboradorId)
      .eq('ativo', true)
      .single()

    if (error || !data) throw new Error('Colaborador não encontrado')

    const pinHash = await sha256(pin)
    if (pinHash !== data.pin_hash) throw new Error('PIN incorreto')

    let setores = []
    let setorPrincipal = null
    if (data.role === 'gerente') {
      const { data: gs } = await supabase
        .from('gerente_setores')
        .select('setor_id, setores(id, label, color_idx)')
        .eq('colaborador_id', data.id)
      setores = gs?.map(g => g.setores) || []
      setorPrincipal = setores[0] || null
    } else if (data.role === 'colaborador' && data.setor_id) {
      const { data: st } = await supabase
        .from('setores')
        .select('id, label, color_idx')
        .eq('id', data.setor_id)
        .single()
      setorPrincipal = st
      setores = st ? [st] : []
    }

    const sessionUser = {
      id: data.id,
      nome: data.nome,
      initials: data.initials,
      role: data.role,
      setor_id: setorPrincipal?.id || null,
      setor: setorPrincipal,
      setores,
      color_idx: data.color_idx,
    }

    localStorage.setItem(SESSION_KEY, JSON.stringify({ data: sessionUser, expiresAt: Date.now() + SESSION_DURATION }))
    setUser(sessionUser)
    return sessionUser
  }

  function logout() {
    setUser(null)
    localStorage.removeItem(SESSION_KEY)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isGestor: user?.role === 'gestor', isGerente: user?.role === 'gerente', canConfig: user?.role === 'gestor' || user?.role === 'gerente' }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

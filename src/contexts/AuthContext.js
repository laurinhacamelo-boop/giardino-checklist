import { createContext, useContext, useState, useEffect } from 'react'
import bcrypt from 'bcryptjs/dist/bcrypt'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
const SESSION_KEY = 'giardino_session'
const SESSION_DURATION = 24 * 60 * 60 * 1000 // 24 horas em ms

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY)
    if (saved) {
      try {
        const { data, expiresAt } = JSON.parse(saved)
        if (Date.now() < expiresAt) {
          setUser(data)
        } else {
          localStorage.removeItem(SESSION_KEY)
        }
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

    const match = await bcrypt.compare(pin, data.pin_hash)
    if (!match) throw new Error('PIN incorreto')

    // Busca setores do gerente (múltiplos)
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

    const expiresAt = Date.now() + SESSION_DURATION
    localStorage.setItem(SESSION_KEY, JSON.stringify({ data: sessionUser, expiresAt }))
    setUser(sessionUser)
    return sessionUser
  }

  function logout() {
    setUser(null)
    localStorage.removeItem(SESSION_KEY)
  }

  const isGestor = user?.role === 'gestor'
  const isGerente = user?.role === 'gerente'
  const canConfig = isGestor || isGerente

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isGestor, isGerente, canConfig }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve estar dentro de AuthProvider')
  return ctx
}

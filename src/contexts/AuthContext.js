import { createContext, useContext, useState, useEffect, useCallback } from 'react'
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

export { sha256 }

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

  async function buildUserSession(data) {
    let setores = []
    let setorPrincipal = null

    if (data.role === 'gestor') {
      // gestor vê tudo, sem setor específico
    } else if (data.role === 'gerente') {
      const { data: gs } = await supabase
        .from('gerente_setores')
        .select('setor_id, setores(id, label, color_idx)')
        .eq('colaborador_id', data.id)
      setores = gs?.map(g => g.setores).filter(Boolean) || []
      // fallback para setor_id direto se não tiver na tabela gerente_setores
      if (setores.length === 0 && data.setor_id) {
        const { data: st } = await supabase
          .from('setores')
          .select('id, label, color_idx')
          .eq('id', data.setor_id)
          .single()
        if (st) setores = [st]
      }
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

    return {
      id: data.id,
      nome: data.nome,
      initials: data.initials,
      role: data.role,
      setor_id: setorPrincipal?.id || data.setor_id || null,
      setor: setorPrincipal,
      setores,
      color_idx: data.color_idx,
    }
  }

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

    const sessionUser = await buildUserSession(data)
    localStorage.setItem(SESSION_KEY, JSON.stringify({ data: sessionUser, expiresAt: Date.now() + SESSION_DURATION }))
    setUser(sessionUser)
    return sessionUser
  }

  async function changePin(currentPin, newPin) {
    if (!user) throw new Error('Não autenticado')
    const { data } = await supabase
      .from('colaboradores')
      .select('pin_hash')
      .eq('id', user.id)
      .single()
    const currentHash = await sha256(currentPin)
    if (currentHash !== data.pin_hash) throw new Error('PIN atual incorreto')
    const newHash = await sha256(newPin)
    await supabase.from('colaboradores').update({ pin_hash: newHash }).eq('id', user.id)
  }

  function logout() {
    setUser(null)
    localStorage.removeItem(SESSION_KEY)
  }

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout, changePin, sha256,
      isGestor: user?.role === 'gestor',
      isGerente: user?.role === 'gerente',
      isColaborador: user?.role === 'colaborador',
      canConfig: user?.role === 'gestor' || user?.role === 'gerente',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
// src/hooks/useAudit.js
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function useAudit() {
  const { user } = useAuth()

  async function log(tipo, acao, alvo, setor_id = null) {
    if (!user) return
    await supabase.from('auditoria').insert({
      colaborador_id: user.id,
      tipo,
      acao,
      alvo,
      setor_id,
    })
  }

  return { log }
}

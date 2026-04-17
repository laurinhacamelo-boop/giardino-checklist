import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { paletteColor } from '../lib/theme'
import styles from './LoginScreen.module.css'

export default function LoginScreen() {
  const [colaboradores, setColaboradores] = useState([])
  const [selected, setSelected] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) navigate(user.role === 'colaborador' ? '/checklist' : '/config')
  }, [user, navigate])

  useEffect(() => {
    supabase
      .from('colaboradores')
      .select('id, nome, initials, role, color_idx, setor_id, setores(label)')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setColaboradores(data || []))
  }, [])

  function roleLabel(c) {
    if (c.role === 'gestor') return 'Gestor'
    if (c.role === 'gerente') return 'Gerente'
    return c.setores?.label || 'Colaborador'
  }

  async function handlePin(key) {
    if (key === '⌫') { setPin(p => p.slice(0, -1)); setError(''); return }
    if (pin.length >= 4) return
    const newPin = pin + key
    setPin(newPin)
    setError('')
    if (newPin.length === 4) {
      if (!selected) { setError('Selecione seu nome primeiro'); setPin(''); return }
      setLoading(true)
      try {
        const u = await login(selected.id, newPin)
        navigate(u.role === 'colaborador' ? '/checklist' : '/config')
      } catch (e) {
        setError(e.message)
        setPin('')
      } finally {
        setLoading(false)
      }
    }
  }

  const PAD = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div className={styles.wrap}>
      <img src="/logo.png" alt="Giardino" className={styles.logoImg} />
      <div className={styles.tagline}>Gestão de checklists</div>

      <div className={styles.selectWrap}>
        <select
          className={styles.select}
          value={selected?.id || ''}
          onChange={e => {
            const found = colaboradores.find(c => c.id === e.target.value)
            setSelected(found || null)
            setPin('')
            setError('')
          }}
        >
          <option value="">Selecione seu nome...</option>
          {colaboradores.map(c => (
            <option key={c.id} value={c.id}>
              {c.nome} — {roleLabel(c)}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <>
          <div className={styles.selectedInfo}>
            {(() => {
              const p = paletteColor(selected.color_idx)
              return (
                <div className={styles.selectedChip}>
                  <div className={styles.chipAv} style={{ background: p.bg, color: p.fg }}>
                    {selected.initials}
                  </div>
                  <div>
                    <div className={styles.chipName}>{selected.nome}</div>
                    <div className={styles.chipRole}>{roleLabel(selected)}</div>
                  </div>
                </div>
              )
            })()}
          </div>

          <div className={styles.pinLabel}>Digite seu PIN</div>
          <div className={styles.dots}>
            {[0,1,2,3].map(i => (
              <div key={i} className={`${styles.dot} ${pin.length > i ? styles.dotFilled : ''}`} />
            ))}
          </div>

          <div className={styles.pad}>
            {PAD.map((k, i) => (
              k === '' ? <div key={i} /> :
              <button key={i}
                className={`${styles.key} ${k==='⌫' ? styles.del : ''}`}
                onClick={() => !loading && handlePin(k)}
                disabled={loading}>
                {k}
              </button>
            ))}
          </div>

          {error && <div className={styles.error}>{error}</div>}
        </>
      )}
    </div>
  )
}

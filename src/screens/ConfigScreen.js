// src/screens/ConfigScreen.js
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useAudit } from '../hooks/useAudit'
import { supabase } from '../lib/supabase'
import { paletteColor, PALETTE, getInitials } from '../lib/theme'
import styles from './ConfigScreen.module.css'

async function sha256(text) {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function ConfigScreen() {
  const { user, logout, isGestor, isGerente, changePin } = useAuth()
  const { log } = useAudit()
  const navigate = useNavigate()
  const [screen, setScreen] = useState('menu')
  const [sheet, setSheet] = useState(null)
  const [setores, setSetores] = useState([])
  const [activeSetorId, setActiveSetorId] = useState(null)

  const loadSetores = useCallback(async () => {
    const { data } = await supabase.from('setores').select('*').eq('ativo', true).order('label')
    setSetores(data || [])
    if (!activeSetorId && data?.length) {
      setActiveSetorId(isGerente ? user.setor_id : data[0].id)
    }
  }, [activeSetorId, isGerente, user.setor_id])

  useEffect(() => { loadSetores() }, [])

  function goBack() { setScreen('menu') }
  const userAv = paletteColor(user.color_idx)

  return (
    <div className={styles.app}>
      {screen === 'menu' && (
        <>
          <div className={styles.topBar}>
            <div className={styles.tbTitle}>Configurações</div>
            <div className={styles.tbPill}>
              <div className={styles.pillAv} style={{ background: userAv.bg, color: userAv.fg }}>{user.initials}</div>
              <span>{user.nome.split(' ')[0]}</span>
            </div>
          </div>
          <div className={styles.body}>
            <MenuItems
              user={user} isGestor={isGestor} isGerente={isGerente}
              setores={setores}
              onStats={() => setScreen('stats')}
              onMyStats={() => setScreen('mystats')}
              onSetores={() => setScreen('setores')}
              onAudit={() => setScreen('audit')}
              onColabs={() => setScreen('colabs')}
              onTarefas={(sid) => { setActiveSetorId(sid); setScreen('tarefas') }}
              onAlertas={() => setScreen('alertas')}
              onChecklist={() => navigate('/checklist')}
              onChangePin={() => setSheet({ type: 'change-pin-self' })}
            />
            <button className={styles.logoutBtn} onClick={logout}>Sair</button>
          </div>
        </>
      )}

      {screen === 'setores' && (
        <SetoresScreen
          setores={setores} onBack={goBack}
          onAdd={() => setSheet({ type: 'add-setor' })}
          onEdit={s => setSheet({ type: 'edit-setor', setor: s })}
          onDelete={s => setSheet({ type: 'del-setor', setor: s })}
          onGoTarefas={sid => { setActiveSetorId(sid); setScreen('tarefas') }}
          onGoColabs={sid => { setActiveSetorId(sid); setScreen('colabs') }}
        />
      )}

      {screen === 'colabs' && (
        <ColabsScreen
          setores={setores}
          filterSetor={isGerente ? user.setor_id : null}
          isGestor={isGestor}
          onBack={goBack}
          onAdd={() => setSheet({ type: 'add-colab' })}
          onEdit={c => setSheet({ type: 'edit-colab', colab: c })}
          onDelete={c => setSheet({ type: 'del-colab', colab: c })}
          onResetPin={c => setSheet({ type: 'reset-pin', colab: c })}
          log={log}
        />
      )}

      {screen === 'tarefas' && activeSetorId && (
        <TarefasScreen setorId={activeSetorId} setores={setores} onBack={goBack} log={log} />
      )}

      {screen === 'alertas' && (
        <AlertasScreen setores={setores} filterSetor={isGerente ? user.setor_id : null} onBack={goBack} log={log} />
      )}

      {screen === 'stats' && (
        <StatsScreen setores={setores} filterSetor={isGerente ? user.setor_id : null} onBack={goBack} />
      )}

      {screen === 'mystats' && <MyStatsScreen user={user} onBack={goBack} />}
      {screen === 'audit' && <AuditScreen onBack={goBack} setores={setores} />}

      {sheet && (
        <SheetOverlay onClose={() => setSheet(null)}>
          {sheet.type === 'change-pin-self' && (
            <ChangePinSelfSheet
              onSave={async (currentPin, newPin) => {
                await changePin(currentPin, newPin)
                await log('config', 'alterou o próprio PIN', user.nome)
                setSheet(null)
              }}
              onClose={() => setSheet(null)}
            />
          )}
          {sheet.type === 'reset-pin' && (
            <ResetPinSheet
              colab={sheet.colab}
              onSave={async (newPin) => {
                const hash = await sha256(newPin)
                await supabase.from('colaboradores').update({ pin_hash: hash }).eq('id', sheet.colab.id)
                await log('config', 'redefiniu o PIN do colaborador', sheet.colab.nome, sheet.colab.setor_id)
                setSheet(null)
              }}
              onClose={() => setSheet(null)}
            />
          )}
          {(sheet.type === 'add-setor' || sheet.type === 'edit-setor') && (
            <SetorSheet
              setor={sheet.setor}
              onSave={async (label, colorIdx) => {
                if (sheet.type === 'add-setor') {
                  await supabase.from('setores').insert({ label, color_idx: colorIdx })
                  await log('setor', 'criou o setor', label)
                } else {
                  await supabase.from('setores').update({ label, color_idx: colorIdx }).eq('id', sheet.setor.id)
                  await log('setor', 'editou o setor', `${sheet.setor.label} → ${label}`)
                }
                await loadSetores()
                setSheet(null)
              }}
              onClose={() => setSheet(null)}
            />
          )}
          {sheet.type === 'del-setor' && (
            <ConfirmSheet
              title="Remover setor"
              text={`Remover "${sheet.setor.label}"? Todos os blocos, tarefas e vínculos serão removidos.`}
              danger
              onConfirm={async () => {
                await supabase.from('setores').update({ ativo: false }).eq('id', sheet.setor.id)
                await log('setor', 'removeu o setor', sheet.setor.label)
                await loadSetores()
                setSheet(null)
              }}
              onClose={() => setSheet(null)}
            />
          )}
          {(sheet.type === 'add-colab' || sheet.type === 'edit-colab') && (
            <ColabSheet
              colab={sheet.colab}
              setores={setores}
              userRole={user.role}
              userSetorId={user.setor_id}
              onSave={async (data) => {
                const hash = await sha256(data.pin)
                const setor_principal = data.role === 'gerente'
                  ? (data.setoresGerente?.[0] || null)
                  : (data.setor_id || null)

                if (sheet.type === 'add-colab') {
                  const { data: novo } = await supabase.from('colaboradores').insert({
                    nome: data.nome, initials: getInitials(data.nome),
                    role: data.role, setor_id: setor_principal,
                    pin_hash: hash, color_idx: data.color_idx,
                  }).select('id').single()
                  if (data.role === 'gerente' && data.setoresGerente?.length && novo) {
                    for (const sid of data.setoresGerente) {
                      await supabase.from('gerente_setores').insert({ colaborador_id: novo.id, setor_id: sid })
                    }
                  }
                  await log('colab', 'adicionou o colaborador', data.nome, setor_principal)
                } else {
                  const update = {
                    nome: data.nome, initials: getInitials(data.nome),
                    role: data.role, setor_id: setor_principal,
                    color_idx: data.color_idx,
                  }
                  if (data.pinChanged) update.pin_hash = hash
                  await supabase.from('colaboradores').update(update).eq('id', sheet.colab.id)
                  if (data.role === 'gerente' && data.setoresGerente) {
                    await supabase.from('gerente_setores').delete().eq('colaborador_id', sheet.colab.id)
                    for (const sid of data.setoresGerente) {
                      await supabase.from('gerente_setores').insert({ colaborador_id: sheet.colab.id, setor_id: sid })
                    }
                  }
                  await log('colab', 'editou o colaborador', data.nome, setor_principal)
                }
                setSheet(null)
              }}
              onClose={() => setSheet(null)}
            />
          )}
          {sheet.type === 'del-colab' && (
            <ConfirmSheet
              title="Remover colaborador"
              text={`Remover "${sheet.colab.nome}"? Esta ação não pode ser desfeita.`}
              danger
              onConfirm={async () => {
                await supabase.from('colaboradores').update({ ativo: false }).eq('id', sheet.colab.id)
                await log('colab', 'removeu o colaborador', sheet.colab.nome, sheet.colab.setor_id)
                setSheet(null)
              }}
              onClose={() => setSheet(null)}
            />
          )}
        </SheetOverlay>
      )}
    </div>
  )
}

function MenuItems({ user, isGestor, isGerente, setores, onStats, onMyStats, onSetores, onAudit, onColabs, onTarefas, onAlertas, onChecklist, onChangePin }) {
  const setor = setores.find(s => s.id === user.setor_id)
  const p = setor ? paletteColor(setor.color_idx) : paletteColor(0)
  const sl = setor?.label || ''

  return (
    <>
      <div className={styles.secLbl}>Checklist</div>
      <div className={styles.cfgCard}>
        <CfgRow icon={<ListIcon stroke="#3B6D11" />} iconBg="#EAF3DE" label="Ir para os checklists" onClick={onChecklist} />
      </div>

      <div className={styles.secLbl}>Minha conta</div>
      <div className={styles.cfgCard}>
        <CfgRow icon={<KeyIcon stroke="#534AB7" />} iconBg="#EEEDFE" label="Alterar meu PIN" sub="Redefina sua senha de acesso" onClick={onChangePin} />
      </div>

      {user.role === 'colaborador' && (
        <>
          <div className={styles.secLbl}>Meu desempenho</div>
          <div className={styles.cfgCard}>
            <CfgRow icon={<ChartIcon stroke="#534AB7" />} iconBg="#EEEDFE" label="Minhas estatísticas" sub="Acompanhe seus checks" onClick={onMyStats} />
          </div>
        </>
      )}

      {(isGestor || isGerente) && (
        <>
          <div className={styles.secLbl}>Visão estratégica{isGerente ? ` — ${sl}` : ''}</div>
          <div className={styles.cfgCard}>
            <CfgRow icon={<ChartIcon stroke="#534AB7" />} iconBg="#EEEDFE" label="Painel de estatísticas" sub={isGerente ? sl : 'Todos os setores'} onClick={onStats} />
          </div>
        </>
      )}

      {isGestor && (
        <>
          <div className={styles.secLbl}>Estrutura</div>
          <div className={styles.cfgCard}>
            <CfgRow icon={<HomeIcon stroke="#BA7517" />} iconBg="#FAEEDA" label="Gerenciar setores" sub={`${setores.length} setores`} onClick={onSetores} />
          </div>
          <div className={styles.secLbl}>Auditoria</div>
          <div className={styles.cfgCard}>
            <CfgRow icon={<FileIcon stroke="#A32D2D" />} iconBg="#FCEBEB" label="Histórico de alterações" sub="Todas as mudanças" onClick={onAudit} />
          </div>
        </>
      )}

      {(isGestor || isGerente) && (
        <>
          <div className={styles.secLbl}>Equipe{isGerente ? ` — ${sl}` : ''}</div>
          <div className={styles.cfgCard}>
            <CfgRow icon={<UsersIcon stroke={p.dot} />} iconBg={p.bg} label="Colaboradores" sub={isGerente ? sl : 'Todos os setores'} onClick={onColabs} />
          </div>
          <div className={styles.secLbl}>Checklists{isGerente ? ` — ${sl}` : ''}</div>
          {isGestor ? (
            <div className={styles.cfgCard}>
              {setores.map(s => {
                const sp = paletteColor(s.color_idx)
                return <CfgRow key={s.id} icon={<CheckSquareIcon stroke={sp.dot} />} iconBg={sp.bg} label={s.label} sub="Blocos e tarefas" onClick={() => onTarefas(s.id)} />
              })}
            </div>
          ) : (
            <div className={styles.cfgCard}>
              <CfgRow icon={<CheckSquareIcon stroke={p.dot} />} iconBg={p.bg} label="Tarefas e blocos" onClick={() => onTarefas(user.setor_id)} />
            </div>
          )}
          <div className={styles.secLbl}>Alertas{isGerente ? ` — ${sl}` : ''}</div>
          <div className={styles.cfgCard}>
            <CfgRow icon={<BellIcon stroke="#BA7517" />} iconBg="#FAEEDA" label="Horários e alertas" sub={isGerente ? sl : 'Todos os setores'} onClick={onAlertas} />
          </div>
        </>
      )}
    </>
  )
}

function SetoresScreen({ setores, onBack, onAdd, onEdit, onDelete, onGoTarefas, onGoColabs }) {
  return (
    <>
      <TopBar title="Setores" onBack={onBack} />
      <div className={styles.body}>
        {setores.map(s => {
          const p = paletteColor(s.color_idx)
          return (
            <div key={s.id} className={styles.setorCard}>
              <div className={styles.setorHead}>
                <div className={styles.setorDot} style={{ background: p.dot }} />
                <div className={styles.setorName}>{s.label}</div>
                <div className={styles.rowActions}>
                  <Ib onClick={() => onEdit(s)}><EditIcon /></Ib>
                  <Ib danger onClick={() => onDelete(s)}><TrashIcon /></Ib>
                </div>
              </div>
              <div className={styles.setorGoRow}>
                <button className={styles.setorGoBtn} onClick={() => onGoTarefas(s.id)}>
                  <CheckSquareIcon stroke="#3B6D11" size={13} /> Checklists
                </button>
                <button className={styles.setorGoBtn} onClick={() => onGoColabs(s.id)}>
                  <UsersIcon stroke="#3B6D11" size={13} /> Equipe
                </button>
              </div>
            </div>
          )
        })}
        <button className={styles.addBtn} onClick={onAdd}><PlusIcon /> Adicionar setor</button>
      </div>
    </>
  )
}

function ColabsScreen({ setores, filterSetor, isGestor, onBack, onAdd, onEdit, onDelete, onResetPin }) {
  const [colabs, setColabs] = useState([])

  const loadColabs = useCallback(async () => {
    let q = supabase.from('colaboradores')
      .select('*, setores(label, color_idx)')
      .eq('ativo', true).order('nome')
    if (filterSetor) q = q.eq('setor_id', filterSetor)
    const { data } = await q
    setColabs(data || [])
  }, [filterSetor])

  useEffect(() => { loadColabs() }, [loadColabs])

  const handleEdit = async (c) => { onEdit(c); setTimeout(loadColabs, 800) }
  const handleDelete = async (c) => { onDelete(c); setTimeout(loadColabs, 800) }
  const handleAdd = () => { onAdd(); setTimeout(loadColabs, 800) }

  function rb(c) {
    if (c.role === 'gestor') return { lbl: 'Gestor', bg: '#EAF3DE', fg: '#27500A' }
    if (c.role === 'gerente') return { lbl: `Gerente · ${c.setores?.label || ''}`, bg: c.setores ? paletteColor(c.setores.color_idx).bg : '#E6F1FB', fg: c.setores ? paletteColor(c.setores.color_idx).fg : '#0C447C' }
    const p = c.setores ? paletteColor(c.setores.color_idx) : { bg: '#F1EFE8', fg: '#444441' }
    return { lbl: c.setores?.label || '—', bg: p.bg, fg: p.fg }
  }

  return (
    <>
      <TopBar title={filterSetor ? `${setores.find(s=>s.id===filterSetor)?.label} — Colaboradores` : 'Colaboradores'} onBack={onBack} />
      <div className={styles.body}>
        {colabs.map(c => {
          const p = paletteColor(c.color_idx)
          const r = rb(c)
          return (
            <div key={c.id} className={styles.colabCard}>
              <div className={styles.colabAv} style={{ background: p.bg, color: p.fg }}>{c.initials}</div>
              <div className={styles.colabInfo}>
                <div className={styles.colabName}>{c.nome}</div>
                <span className={styles.badge} style={{ background: r.bg, color: r.fg }}>{r.lbl}</span>
              </div>
              <div className={styles.rowActions}>
                {isGestor && <Ib onClick={() => onResetPin(c)} title="Redefinir PIN"><KeyIcon size={13} /></Ib>}
                <Ib onClick={() => handleEdit(c)}><EditIcon /></Ib>
                <Ib danger onClick={() => handleDelete(c)}><TrashIcon /></Ib>
              </div>
            </div>
          )
        })}
        <button className={styles.addBtn} onClick={handleAdd}><PlusIcon /> Adicionar colaborador</button>
      </div>
    </>
  )
}

function TarefasScreen({ setorId, setores, onBack, log }) {
  const [blocos, setBlocos] = useState([])
  const [sheet, setSheet] = useState(null)
  const setor = setores.find(s => s.id === setorId)

  const loadBlocos = useCallback(async () => {
    const { data } = await supabase.from('blocos')
      .select('*, tarefas(id, label, ordem, ativa)')
      .eq('setor_id', setorId).order('ordem')
    setBlocos(data || [])
  }, [setorId])

  useEffect(() => { loadBlocos() }, [loadBlocos])

  async function saveBloco(data, blocoId) {
    if (blocoId) {
      const old = blocos.find(b => b.id === blocoId)
      await supabase.from('blocos').update({ label: data.label, deadline: data.deadline }).eq('id', blocoId)
      await log('bloco', 'editou o bloco', `${old?.label} → ${data.label}`, setorId)
    } else {
      await supabase.from('blocos').insert({ setor_id: setorId, label: data.label, deadline: data.deadline, ordem: blocos.length })
      await log('bloco', 'adicionou o bloco', data.label, setorId)
    }
    await loadBlocos(); setSheet(null)
  }

  async function deleteBloco(bloco) {
    await supabase.from('blocos').delete().eq('id', bloco.id)
    await log('bloco', 'removeu o bloco', bloco.label, setorId)
    await loadBlocos(); setSheet(null)
  }

  async function saveTarefa(label, blocoId, tarefaId) {
    if (tarefaId) {
      await supabase.from('tarefas').update({ label }).eq('id', tarefaId)
      await log('tarefa', 'editou a tarefa', label, setorId)
    } else {
      const bloco = blocos.find(b => b.id === blocoId)
      await supabase.from('tarefas').insert({ bloco_id: blocoId, label, ordem: bloco?.tarefas?.length || 0 })
      await log('tarefa', 'adicionou a tarefa', label, setorId)
    }
    await loadBlocos(); setSheet(null)
  }

  async function deleteTarefa(tarefa) {
    await supabase.from('tarefas').update({ ativa: false }).eq('id', tarefa.id)
    await log('tarefa', 'removeu a tarefa', tarefa.label, setorId)
    await loadBlocos()
  }

  return (
    <>
      <TopBar title={`${setor?.label || ''} — Blocos e tarefas`} onBack={onBack} />
      <div className={styles.body}>
        {blocos.map((bloco) => (
          <div key={bloco.id} className={styles.blockCard}>
            <div className={styles.blockHead}>
              <span className={styles.blockName}>{bloco.label}</span>
              <span className={styles.blockDl}><ClockIcon /> {bloco.deadline}</span>
              <div className={styles.rowActions}>
                <Ib onClick={() => setSheet({ type: 'edit-bloco', bloco })}><EditIcon /></Ib>
                <Ib danger onClick={() => setSheet({ type: 'del-bloco', bloco })}><TrashIcon /></Ib>
              </div>
            </div>
            {bloco.tarefas?.filter(t => t.ativa).sort((a,b) => a.ordem - b.ordem).map(t => (
              <div key={t.id} className={styles.taskRow}>
                <span className={styles.taskRowName}>{t.label}</span>
                <Ib onClick={() => setSheet({ type: 'edit-tarefa', tarefa: t, blocoId: bloco.id })}><EditIcon /></Ib>
                <Ib danger onClick={() => deleteTarefa(t)}><TrashIcon /></Ib>
              </div>
            ))}
            <div className={styles.addTaskRow} onClick={() => setSheet({ type: 'add-tarefa', blocoId: bloco.id })}>
              <PlusIcon /> Adicionar tarefa
            </div>
          </div>
        ))}
        <button className={styles.addBtn} onClick={() => setSheet({ type: 'add-bloco' })}><PlusIcon /> Adicionar bloco</button>
      </div>

      {sheet && (
        <SheetOverlay onClose={() => setSheet(null)}>
          {(sheet.type === 'add-bloco' || sheet.type === 'edit-bloco') && (
            <BlocoSheet bloco={sheet.bloco} onSave={data => saveBloco(data, sheet.bloco?.id)} onClose={() => setSheet(null)} />
          )}
          {sheet.type === 'del-bloco' && (
            <ConfirmSheet title="Remover bloco" text={`Remover "${sheet.bloco.label}" e todas as suas tarefas?`} danger onConfirm={() => deleteBloco(sheet.bloco)} onClose={() => setSheet(null)} />
          )}
          {(sheet.type === 'add-tarefa' || sheet.type === 'edit-tarefa') && (
            <TarefaSheet tarefa={sheet.tarefa} onSave={label => saveTarefa(label, sheet.blocoId, sheet.tarefa?.id)} onClose={() => setSheet(null)} />
          )}
        </SheetOverlay>
      )}
    </>
  )
}

function AlertasScreen({ setores, filterSetor, onBack, log }) {
  const [blocos, setBlocos] = useState([])
  const filtered = filterSetor ? setores.filter(s => s.id === filterSetor) : setores

  const loadBlocos = useCallback(async () => {
    const ids = filtered.map(s => s.id)
    if (!ids.length) return
    const { data } = await supabase.from('blocos').select('*').in('setor_id', ids).order('setor_id').order('ordem')
    setBlocos(data || [])
  }, [setores.length, filterSetor])

  useEffect(() => { loadBlocos() }, [loadBlocos])

  async function update(blocoId, field, value) {
    await supabase.from('blocos').update({ [field]: value }).eq('id', blocoId)
    setBlocos(prev => prev.map(b => b.id === blocoId ? { ...b, [field]: value } : b))
    await log('config', `alterou ${field === 'deadline' ? 'horário' : 'alerta'} do bloco`, blocoId)
  }

  return (
    <>
      <TopBar title="Horários e alertas" onBack={onBack} />
      <div className={styles.body}>
        {filtered.map(s => {
          const sBlocos = blocos.filter(b => b.setor_id === s.id)
          return (
            <div key={s.id}>
              <div className={styles.secLbl}>{s.label}</div>
              <div className={styles.cfgCard}>
                {sBlocos.map(b => (
                  <div key={b.id} className={styles.alertRow}>
                    <span className={styles.alertName}>{b.label}</span>
                    <input type="time" className={styles.timeInput} value={b.deadline}
                      onChange={e => update(b.id, 'deadline', e.target.value)} />
                    <Toggle on={b.alert_enabled} onChange={v => update(b.id, 'alert_enabled', v)} />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        <div className={styles.hintText}>O alerta notifica quando o horário se aproxima e há tarefas pendentes.</div>
      </div>
    </>
  )
}

function StatsScreen({ setores, filterSetor, onBack }) {
  const [period, setPeriod] = useState('week')
  const [setorFilter, setSetorFilter] = useState('todos')
  const [colabStats, setColabStats] = useState([])

  const weekData = { labels: ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'], values: [87,92,78,95,88,72,0], cur: 6 }
  const monthData = { labels: ['S1','S2','S3','S4'], values: [82,89,85,91], cur: 3 }
  const data = period === 'week' ? weekData : monthData
  const maxV = Math.max(...data.values, 1)

  useEffect(() => {
    const mockStats = [
      { id: 1, nome: 'Ana Lima', initials: 'AL', color_idx: 0, setor_id: setores[0]?.id, checks: 142, total: 160 },
      { id: 2, nome: 'Carlos Souza', initials: 'CS', color_idx: 2, setor_id: setores[0]?.id, checks: 131, total: 160 },
      { id: 3, nome: 'Paulo Chef', initials: 'PC', color_idx: 1, setor_id: setores[1]?.id, checks: 98, total: 120 },
    ]
    setColabStats(mockStats)
  }, [setores])

  const filtered = setorFilter === 'todos' ? colabStats
    : filterSetor ? colabStats.filter(c => c.setor_id === filterSetor)
    : colabStats.filter(c => c.setor_id === setorFilter)

  const totalDone = filtered.reduce((a, c) => a + c.checks, 0)
  const totalAll = filtered.reduce((a, c) => a + c.total, 0)
  const gPct = totalAll > 0 ? Math.round(totalDone / totalAll * 100) : 0

  return (
    <>
      <TopBar title={filterSetor ? `Estatísticas — ${setores.find(s=>s.id===filterSetor)?.label}` : 'Painel estratégico'} onBack={onBack} />
      <div className={styles.body}>
        <div className={styles.periodRow}>
          <button className={`${styles.periodBtn} ${period==='week'?styles.periodActive:''}`} onClick={() => setPeriod('week')}>Esta semana</button>
          <button className={`${styles.periodBtn} ${period==='month'?styles.periodActive:''}`} onClick={() => setPeriod('month')}>Este mês</button>
        </div>
        <div className={styles.metricGrid}>
          <div className={styles.metricCard}><div className={styles.metricVal}>{gPct}%</div><div className={styles.metricLbl}>Taxa de conclusão</div><div className={styles.metricSub} style={{color:'#3B6D11'}}>+3% vs anterior</div></div>
          <div className={styles.metricCard}><div className={styles.metricVal}>{Math.round(data.values.filter(v=>v>0).reduce((a,b)=>a+b,0)/Math.max(data.values.filter(v=>v>0).length,1))}%</div><div className={styles.metricLbl}>Média {period==='week'?'diária':'semanal'}</div><div className={styles.metricSub} style={{color:'#3B6D11'}}>Acima da meta</div></div>
        </div>
        <div className={styles.chartWrap}>
          <div className={styles.chartTitle}>Conclusão {period==='week'?'por dia':'por semana'} (%)</div>
          <div className={styles.barChart}>
            {data.labels.map((lbl, i) => {
              const h = data.values[i] > 0 ? Math.round((data.values[i]/maxV)*80) : 2
              return (
                <div key={i} className={styles.barCol}>
                  <div className={styles.bar} style={{ height: h, background: i === data.cur ? '#3B6D11' : '#C0DD97' }}>
                    {data.values[i] > 0 && <span className={styles.barVal}>{data.values[i]}%</span>}
                  </div>
                  <div className={styles.barLbl}>{lbl}</div>
                </div>
              )
            })}
          </div>
        </div>
        <div className={styles.secLbl} style={{marginTop:0}}>Desempenho por colaborador</div>
        {!filterSetor && (
          <div className={styles.setorFilter}>
            <button className={`${styles.sfBtn} ${setorFilter==='todos'?styles.sfActive:''}`} onClick={() => setSetorFilter('todos')}>Todos</button>
            {setores.map(s => <button key={s.id} className={`${styles.sfBtn} ${setorFilter===s.id?styles.sfActive:''}`} onClick={() => setSetorFilter(s.id)}>{s.label}</button>)}
          </div>
        )}
        {filtered.map(c => {
          const p = paletteColor(c.color_idx)
          const pct = Math.round(c.checks / c.total * 100)
          const bc = pct >= 90 ? '#3B6D11' : pct >= 70 ? '#BA7517' : '#E24B4A'
          return (
            <div key={c.id} className={styles.csCard}>
              <div className={styles.csAv} style={{ background: p.bg, color: p.fg }}>{c.initials}</div>
              <div className={styles.csInfo}>
                <div className={styles.csName}>{c.nome}</div>
                <div className={styles.csSub}>{c.checks}/{c.total} checks</div>
                <div className={styles.csBarWrap}><div className={styles.csBarFill} style={{ width: `${pct}%`, background: bc }} /></div>
              </div>
              <div className={styles.csPct} style={{ color: bc }}>{pct}%</div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function MyStatsScreen({ user, onBack }) {
  const pct = 87
  const bc = pct >= 90 ? '#3B6D11' : pct >= 70 ? '#BA7517' : '#E24B4A'
  const wvals = [72,85,90,88,95,70,0]
  const maxW = Math.max(...wvals)
  return (
    <>
      <TopBar title="Minhas estatísticas" onBack={onBack} />
      <div className={styles.body}>
        <div className={styles.myHero}>
          <div className={styles.myCircle} style={{ borderColor: bc }}>
            <div style={{ fontSize: 22, fontWeight: 500, color: bc }}>{pct}%</div>
            <div style={{ fontSize: 11, color: '#666' }}>conclusão</div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{user.nome}</div>
          <div style={{ fontSize: 12, color: '#666' }}>Esta semana</div>
        </div>
        <div className={styles.chartWrap}>
          <div className={styles.chartTitle}>Minha semana</div>
          <div className={styles.barChart}>
            {['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map((d, i) => {
              const h = Math.round((wvals[i]/maxW)*70)
              return (
                <div key={i} className={styles.barCol}>
                  <div className={styles.bar} style={{ height: h, background: i === 6 ? '#3B6D11' : '#C0DD97' }} />
                  <div className={styles.barLbl}>{d}</div>
                </div>
              )
            })}
          </div>
        </div>
        <div className={styles.metricGrid}>
          <div className={styles.metricCard}><div className={styles.metricVal}>142</div><div className={styles.metricLbl}>Checks realizados</div></div>
          <div className={styles.metricCard}><div className={styles.metricVal}>18</div><div className={styles.metricLbl}>Pendentes no período</div></div>
        </div>
      </div>
    </>
  )
}

function AuditScreen({ onBack, setores }) {
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('todos')
  const tipos = Object.keys({ colab:'',tarefa:'',bloco:'',setor:'',config:'' })

  useEffect(() => {
    supabase.from('auditoria')
      .select('*, colaboradores(nome, initials, color_idx), setores(label, color_idx)')
      .order('criado_em', { ascending: false }).limit(100)
      .then(({ data }) => setItems(data || []))
  }, [])

  const TIPO_LABELS = { colab:'Colaborador', tarefa:'Tarefa', bloco:'Bloco', setor:'Setor', config:'Config', check:'Check' }
  const TIPO_COLORS = { colab:{bg:'#EAF3DE',fg:'#27500A'}, tarefa:{bg:'#E6F1FB',fg:'#0C447C'}, bloco:{bg:'#FAEEDA',fg:'#633806'}, setor:{bg:'#EEEDFE',fg:'#3C3489'}, config:{bg:'#FCEBEB',fg:'#791F1F'}, check:{bg:'#E1F5EE',fg:'#085041'} }
  const filtered = filter === 'todos' ? items : items.filter(i => i.tipo === filter)

  return (
    <>
      <TopBar title="Histórico de alterações" onBack={onBack} />
      <div className={styles.body}>
        <div className={styles.auditFilter}>
          <button className={`${styles.afBtn} ${filter==='todos'?styles.afActive:''}`} onClick={() => setFilter('todos')}>Todos</button>
          {tipos.map(t => <button key={t} className={`${styles.afBtn} ${filter===t?styles.afActive:''}`} onClick={() => setFilter(t)}>{TIPO_LABELS[t]}</button>)}
        </div>
        {filtered.map(item => {
          const p = paletteColor(item.colaboradores?.color_idx || 0)
          const tc = TIPO_COLORS[item.tipo] || { bg:'#F1EFE8', fg:'#444441' }
          const sp = item.setores ? paletteColor(item.setores.color_idx) : null
          const ts = new Date(item.criado_em).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
          return (
            <div key={item.id} className={styles.auditCard}>
              <div className={styles.auditAv} style={{ background: p.bg, color: p.fg }}>
                {item.colaboradores?.initials || '?'}
              </div>
              <div className={styles.auditBody}>
                <div className={styles.auditAction}>
                  <strong>{item.colaboradores?.nome?.split(' ')[0]}</strong> {item.acao}: <strong>{item.alvo}</strong>
                </div>
                <div className={styles.auditMeta}>
                  <span className={styles.auditTime}>{ts}</span>
                  <span className={styles.badge} style={{ background: tc.bg, color: tc.fg }}>{TIPO_LABELS[item.tipo]}</span>
                  {sp && <span className={styles.badge} style={{ background: sp.bg, color: sp.fg }}>{item.setores.label}</span>}
                </div>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && <div className={styles.emptyHint}>Nenhum registro encontrado</div>}
      </div>
    </>
  )
}

function ChangePinSelfSheet({ onSave, onClose }) {
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [step, setStep] = useState('current')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    if (newPin !== confirmPin) { setError('Os PINs não coincidem'); return }
    setLoading(true)
    try { await onSave(currentPin, newPin) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <>
      <div className={styles.sheetTitle}>Alterar meu PIN</div>
      {step === 'current' && (
        <>
          <div className={styles.formGroup}><div className={styles.formLabel}>PIN atual</div><PinInput value={currentPin} onChange={setCurrentPin} /></div>
          <button className={styles.saveBtn} disabled={currentPin.length !== 4} onClick={() => { setStep('new'); setError('') }}>Continuar</button>
        </>
      )}
      {step === 'new' && (
        <>
          <div className={styles.formGroup}><div className={styles.formLabel}>Novo PIN</div><PinInput value={newPin} onChange={setNewPin} /></div>
          <button className={styles.saveBtn} disabled={newPin.length !== 4} onClick={() => { setStep('confirm'); setError('') }}>Continuar</button>
        </>
      )}
      {step === 'confirm' && (
        <>
          <div className={styles.formGroup}><div className={styles.formLabel}>Confirme o novo PIN</div><PinInput value={confirmPin} onChange={setConfirmPin} /></div>
          {error && <div style={{color:'#A32D2D',fontSize:13,marginBottom:8}}>{error}</div>}
          <button className={styles.saveBtn} disabled={confirmPin.length !== 4 || loading} onClick={handleSave}>Salvar novo PIN</button>
        </>
      )}
      <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
    </>
  )
}

function ResetPinSheet({ colab, onSave, onClose }) {
  const [newPin, setNewPin] = useState('')
  const [loading, setLoading] = useState(false)
  return (
    <>
      <div className={styles.sheetTitle}>Redefinir PIN</div>
      <div style={{fontSize:13,color:'#666',marginBottom:16}}>Novo PIN para <strong>{colab.nome}</strong></div>
      <div className={styles.formGroup}><div className={styles.formLabel}>Novo PIN (4 dígitos)</div><PinInput value={newPin} onChange={setNewPin} /></div>
      <button className={styles.saveBtn} disabled={newPin.length !== 4 || loading}
        onClick={async () => { setLoading(true); await onSave(newPin); setLoading(false) }}>Salvar</button>
      <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
    </>
  )
}

function SetorSheet({ setor, onSave, onClose }) {
  const [label, setLabel] = useState(setor?.label || '')
  const [colorIdx, setColorIdx] = useState(setor?.color_idx || 0)
  return (
    <>
      <div className={styles.sheetTitle}>{setor ? 'Editar setor' : 'Novo setor'}</div>
      <div className={styles.formGroup}><div className={styles.formLabel}>Nome do setor</div>
        <input className={styles.formInput} value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex: Bar, Eventos..." /></div>
      <div className={styles.formGroup}><div className={styles.formLabel}>Cor</div>
        <div className={styles.colorPicker}>
          {PALETTE.map((p, i) => (
            <div key={i} className={`${styles.colorSwatch} ${colorIdx === i ? styles.colorSwatchSel : ''}`}
              style={{ background: p.dot }} onClick={() => setColorIdx(i)} />
          ))}
        </div>
      </div>
      <button className={styles.saveBtn} disabled={!label.trim()} onClick={() => onSave(label, colorIdx)}>Salvar</button>
      <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
    </>
  )
}

function ColabSheet({ colab, setores, userRole, userSetorId, onSave, onClose }) {
  const [nome, setNome] = useState(colab?.nome || '')
  const [role, setRole] = useState(colab?.role || 'colaborador')
  const [setorId, setSetorId] = useState(colab?.setor_id || userSetorId || '')
  const [setoresGerente, setSetoresGerente] = useState([])
  const [pin, setPin] = useState('')
  const [colorIdx] = useState(colab?.color_idx ?? Math.floor(Math.random() * PALETTE.length))
  const roles = userRole === 'gestor' ? ['gestor','gerente','colaborador'] : ['colaborador']
  const roleLabels = { gestor:'Gestor', gerente:'Gerente', colaborador:'Colaborador' }
  const setoresList = userRole === 'gestor' ? setores : setores.filter(s => s.id === userSetorId)

  // Carrega setores do gerente ao editar
  useEffect(() => {
    if (colab && colab.role === 'gerente') {
      supabase.from('gerente_setores')
        .select('setor_id')
        .eq('colaborador_id', colab.id)
        .then(({ data }) => {
          const ids = data?.map(g => g.setor_id) || []
          if (ids.length === 0 && colab.setor_id) setSetoresGerente([colab.setor_id])
          else setSetoresGerente(ids)
        })
    }
  }, [colab])

  function toggleSetorGerente(sid) {
    setSetoresGerente(prev =>
      prev.includes(sid) ? prev.filter(id => id !== sid) : [...prev, sid]
    )
  }

  const canSave = nome.trim() && (colab ? true : pin.length === 4) &&
    (role !== 'gerente' || setoresGerente.length > 0)

  return (
    <>
      <div className={styles.sheetTitle}>{colab ? 'Editar colaborador' : 'Novo colaborador'}</div>
      <div className={styles.formGroup}><div className={styles.formLabel}>Nome completo</div>
        <input className={styles.formInput} value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome" /></div>
      <div className={styles.formGroup}><div className={styles.formLabel}>Função</div>
        <div className={styles.roleOpts}>
          {roles.map(r => (
            <div key={r} className={`${styles.roleOpt} ${role === r ? styles.roleOptSel : ''}`} onClick={() => setRole(r)}>
              <div className={styles.roL}>{roleLabels[r]}</div>
            </div>
          ))}
        </div>
      </div>

      {role === 'gerente' ? (
        <div className={styles.formGroup}>
          <div className={styles.formLabel}>Setores (pode escolher mais de um)</div>
          <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:4}}>
            {setoresList.map(s => {
              const sel = setoresGerente.includes(s.id)
              const p = paletteColor(s.color_idx)
              return (
                <div key={s.id}
                  onClick={() => toggleSetorGerente(s.id)}
                  style={{
                    display:'flex',alignItems:'center',gap:12,padding:'11px 14px',
                    borderRadius:10,border:`1.5px solid ${sel ? p.dot : '#e5e5e5'}`,
                    background: sel ? p.bg : 'white',cursor:'pointer',transition:'all 0.15s'
                  }}>
                  <div style={{
                    width:20,height:20,borderRadius:6,border:`2px solid ${sel ? p.dot : '#ccc'}`,
                    background: sel ? p.dot : 'transparent',
                    display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0
                  }}>
                    {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  <span style={{fontSize:14,fontWeight:500,color:'#1a1a18'}}>{s.label}</span>
                </div>
              )
            })}
          </div>
          {setoresGerente.length === 0 && (
            <div style={{fontSize:12,color:'#A32D2D',marginTop:6}}>Selecione pelo menos um setor</div>
          )}
        </div>
      ) : (
        <div className={styles.formGroup}><div className={styles.formLabel}>Setor</div>
          <select className={styles.formSelect} value={setorId} onChange={e => setSetorId(e.target.value)}>
            {setoresList.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            {userRole === 'gestor' && <option value="">— Sem setor</option>}
          </select>
        </div>
      )}

      <div className={styles.formGroup}><div className={styles.formLabel}>PIN {colab ? '(deixe vazio para não alterar)' : '(4 dígitos)'}</div>
        <PinInput value={pin} onChange={setPin} /></div>
      <button className={styles.saveBtn} disabled={!canSave}
        onClick={() => onSave({
          nome, role,
          setor_id: role === 'gerente' ? (setoresGerente[0] || null) : (setorId || null),
          pin: pin || '0000',
          pinChanged: pin.length === 4,
          color_idx: colorIdx,
          setoresGerente: role === 'gerente' ? setoresGerente : null,
        })}>
        Salvar
      </button>
      <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
    </>
  )
}

function BlocoSheet({ bloco, onSave, onClose }) {
  const [label, setLabel] = useState(bloco?.label || '')
  const [deadline, setDeadline] = useState(bloco?.deadline || '10:00')
  return (
    <>
      <div className={styles.sheetTitle}>{bloco ? 'Editar bloco' : 'Novo bloco'}</div>
      <div className={styles.formGroup}><div className={styles.formLabel}>Nome do bloco</div>
        <input className={styles.formInput} value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex: Abertura, Serviço..." /></div>
      <div className={styles.formGroup}><div className={styles.formLabel}>Horário limite</div>
        <input className={styles.formInput} type="time" value={deadline} onChange={e => setDeadline(e.target.value)} /></div>
      <button className={styles.saveBtn} disabled={!label.trim()} onClick={() => onSave({ label, deadline })}>Salvar</button>
      <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
    </>
  )
}

function TarefaSheet({ tarefa, onSave, onClose }) {
  const [label, setLabel] = useState(tarefa?.label || '')
  return (
    <>
      <div className={styles.sheetTitle}>{tarefa ? 'Editar tarefa' : 'Nova tarefa'}</div>
      <div className={styles.formGroup}><div className={styles.formLabel}>Nome da tarefa</div>
        <input className={styles.formInput} value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex: Verificar temperatura..." /></div>
      <button className={styles.saveBtn} disabled={!label.trim()} onClick={() => onSave(label)}>Salvar</button>
      <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
    </>
  )
}

function ConfirmSheet({ title, text, danger, onConfirm, onClose }) {
  return (
    <>
      <div className={styles.sheetTitle}>{title}</div>
      <p className={styles.confirmTxt}>{text}</p>
      <button className={danger ? styles.dangerBtn : styles.saveBtn} onClick={onConfirm}>Confirmar</button>
      <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
    </>
  )
}

function PinInput({ value, onChange }) {
  const PAD = ['1','2','3','4','5','6','7','8','9','','0','⌫']
  function handle(k) {
    if (k === '⌫') onChange(value.slice(0, -1))
    else if (value.length < 4) onChange(value + k)
  }
  return (
    <div>
      <div className={styles.pinDots}>
        {[0,1,2,3].map(i => <div key={i} className={`${styles.pinDot} ${value.length > i ? styles.pinDotFilled : ''}`} />)}
      </div>
      <div className={styles.pinMiniPad}>
        {PAD.map((k, i) => k === '' ? <div key={i} /> :
          <button key={i} className={styles.pmk} onClick={() => handle(k)}>{k}</button>)}
      </div>
    </div>
  )
}

function TopBar({ title, onBack }) {
  return (
    <div className={styles.topBar}>
      {onBack && <button className={styles.tbBack} onClick={onBack}><BackIcon /></button>}
      <div className={styles.tbTitle}>{title}</div>
    </div>
  )
}

function CfgRow({ icon, iconBg, label, sub, count, onClick }) {
  return (
    <div className={styles.cfgRow} onClick={onClick}>
      <div className={styles.ri} style={{ background: iconBg }}>{icon}</div>
      <div className={styles.rb}>
        <div className={styles.rl}>{label}</div>
        {sub && <div className={styles.rs}>{sub}</div>}
      </div>
      <div className={styles.rr}>
        {count != null && <span className={styles.cnt}>{count}</span>}
        <ChevronIcon />
      </div>
    </div>
  )
}

function Ib({ children, danger, onClick, title }) {
  return <div className={`${styles.ib} ${danger ? styles.ibDanger : ''}`} onClick={onClick} title={title}>{children}</div>
}

function Toggle({ on, onChange }) {
  return (
    <button className={styles.toggle} style={{ background: on ? '#3B6D11' : 'var(--color-border-secondary)' }}
      onClick={() => onChange(!on)}>
      <div className={styles.toggleKnob} style={{ left: on ? 21 : 3 }} />
    </button>
  )
}

function SheetOverlay({ children, onClose }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <div className={styles.sheetHandle} />
        {children}
      </div>
    </div>
  )
}

const BackIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
const ChevronIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
const EditIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const TrashIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
const PlusIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const ClockIcon = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const ChartIcon = ({ stroke }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
const HomeIcon = ({ stroke }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
const FileIcon = ({ stroke }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
const ListIcon = ({ stroke }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
const UsersIcon = ({ stroke, size=16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
const CheckSquareIcon = ({ stroke, size=16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
const BellIcon = ({ stroke }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
const KeyIcon = ({ stroke = '#534AB7', size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5"><circle cx="8" cy="15" r="5"/><path d="M21 2l-9.3 9.3M15 8l3 3"/></svg>
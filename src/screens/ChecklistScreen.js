import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase, uploadFile, storagePath } from '../lib/supabase'
import { isLate, today, paletteColor, fmtTime } from '../lib/theme'
import styles from './ChecklistScreen.module.css'

export default function ChecklistScreen() {
  const { user, logout, isGestor, isGerente } = useAuth()
  const navigate = useNavigate()
  const [setores, setSetores] = useState([])
  const [activeSetor, setActiveSetor] = useState(null)
  const [blocos, setBlocos] = useState([])
  const [checks, setChecks] = useState({}) // tarefa_id -> array de checks
  const [anotacoes, setAnotacoes] = useState({})
  const [sheet, setSheet] = useState(null)
  const [expandedPhotos, setExpandedPhotos] = useState({})

  useEffect(() => {
    async function loadSetores() {
      let query = supabase.from('setores').select('*').eq('ativo', true).order('label')
      if (user.role === 'colaborador') {
        query = query.eq('id', user.setor_id)
      } else if (user.role === 'gerente') {
        const setorIds = user.setores?.map(s => s.id) || []
        if (user.setor_id && !setorIds.includes(user.setor_id)) setorIds.push(user.setor_id)
        if (setorIds.length > 0) query = query.in('id', setorIds)
      }
      const { data } = await query
      setSetores(data || [])
      if (data?.length) setActiveSetor(data[0].id)
    }
    loadSetores()
  }, [user])

  const loadBlocos = useCallback(async (setorId) => {
    if (!setorId) return
    const { data } = await supabase
      .from('blocos')
      .select('*, tarefas(id, label, ordem, ativa)')
      .eq('setor_id', setorId)
      .eq('alert_enabled', true)
      .order('ordem')

    const blocosAtivos = (data || []).map(b => ({
      ...b,
      tarefas: b.tarefas.filter(t => t.ativa)
    }))
    setBlocos(blocosAtivos)

    const tarefaIds = blocosAtivos.flatMap(b => b.tarefas.map(t => t.id))
    if (tarefaIds.length) {
      const { data: checksData } = await supabase
        .from('checks')
        .select('*, colaboradores(nome, initials, color_idx), check_fotos(id, storage_path)')
        .in('tarefa_id', tarefaIds)
        .eq('data', today())
        .order('feito_em')
      // Agrupa checks por tarefa_id como array
      const map = {}
      checksData?.forEach(c => {
        if (!map[c.tarefa_id]) map[c.tarefa_id] = []
        map[c.tarefa_id].push(c)
      })
      setChecks(map)
    } else {
      setChecks({})
    }

    const blocoIds = blocosAtivos.map(b => b.id)
    if (blocoIds.length) {
      const { data: anotData } = await supabase
        .from('anotacoes')
        .select('*, colaboradores(nome, initials, color_idx)')
        .in('bloco_id', blocoIds)
        .eq('data', today())
        .order('criado_em')
      const map = {}
      anotData?.forEach(a => {
        if (!map[a.bloco_id]) map[a.bloco_id] = []
        map[a.bloco_id].push(a)
      })
      setAnotacoes(map)
    } else {
      setAnotacoes({})
    }
  }, [])

  useEffect(() => {
    if (activeSetor) loadBlocos(activeSetor)
  }, [activeSetor, loadBlocos])

  // Tarefa concluída = tem pelo menos um check total
  function isConcluida(tarefaId) {
    const lista = checks[tarefaId] || []
    return lista.some(c => c.tipo === 'total')
  }

  function hasAnyCheck(tarefaId) {
    return (checks[tarefaId] || []).length > 0
  }

  function handleCheck(tarefa) {
    // Se já tem check total, permite remover todos
    if (isConcluida(tarefa.id)) {
      setSheet({ type: 'remove-check', tarefa })
      return
    }
    // Abre sheet para adicionar check
    setSheet({ type: 'who-check', tarefa })
  }

  async function confirmCheck(tarefa, colaboradorId, tipo) {
    const { data } = await supabase.from('checks').insert({
      tarefa_id: tarefa.id,
      colaborador_id: colaboradorId,
      data: today(),
      tipo,
    }).select('*, colaboradores(nome, initials, color_idx)').single()

    setChecks(prev => ({
      ...prev,
      [tarefa.id]: [...(prev[tarefa.id] || []), data]
    }))
    setSheet(null)
  }

  async function removeAllChecks(tarefaId) {
    const lista = checks[tarefaId] || []
    for (const c of lista) {
      await supabase.from('checks').delete().eq('id', c.id)
    }
    setChecks(prev => { const n = { ...prev }; delete n[tarefaId]; return n })
    setSheet(null)
  }

  async function handleTaskPhoto(tarefaId, file) {
    const lista = checks[tarefaId] || []
    const check = lista[lista.length - 1]
    if (!check) return
    const path = storagePath('fotos/checks', file.name.split('.').pop())
    const url = await uploadFile('fotos', path, file)
    await supabase.from('check_fotos').insert({ check_id: check.id, storage_path: url })
    loadBlocos(activeSetor)
  }

  async function saveAnotacao(blocoId, { texto, foto, audio }) {
    const fotoPath = foto ? await uploadFile('fotos', storagePath('fotos/anotacoes', 'jpg'), foto) : null
    const audioPath = audio ? await uploadFile('audios', storagePath('audios', 'webm'), audio) : null
    const { data } = await supabase.from('anotacoes').insert({
      bloco_id: blocoId,
      colaborador_id: user.id,
      data: today(),
      texto: texto || null,
      foto_path: fotoPath,
      audio_path: audioPath,
    }).select('*, colaboradores(nome, initials, color_idx)').single()
    setAnotacoes(prev => ({
      ...prev,
      [blocoId]: [...(prev[blocoId] || []), data],
    }))
    setSheet(null)
  }

  const totalTasks = blocos.reduce((a, b) => a + b.tarefas.length, 0)
  const doneTasks = blocos.reduce((a, b) => a + b.tarefas.filter(t => isConcluida(t.id)).length, 0)
  const pct = totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : 0

  return (
    <div className={styles.app}>
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <div className={styles.logo}><span>Giardino</span> checklists</div>
          <div className={styles.headerActions}>
            {(isGestor || isGerente) && (
              <button className={styles.configBtn} onClick={() => navigate('/config')}>
                <ConfigIcon />
              </button>
            )}
            <button className={styles.userPill} onClick={logout}>
              <div className={styles.pillAv} style={avatarStyle(user.color_idx)}>{user.initials}</div>
              <span>{user.nome.split(' ')[0]}</span>
            </button>
          </div>
        </div>
        {setores.length > 1 && (
          <div className={styles.tabs}>
            {setores.map(s => (
              <button key={s.id}
                className={`${styles.tab} ${activeSetor === s.id ? styles.tabActive : ''}`}
                onClick={() => setActiveSetor(s.id)}>
                {s.label}
                {hasAlertSetor(s.id, blocos, checks, isConcluida) && <span className={styles.tabDot} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.progressCard}>
          <div className={styles.progressRow}>
            <span className={styles.progressLabel}>Progresso de hoje</span>
            <span className={styles.progressNums}>{doneTasks}/{totalTasks} tarefas</span>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
          </div>
        </div>

        {blocos.map(bloco => {
          const late = isLate(bloco.deadline)
          const pending = bloco.tarefas.filter(t => !isConcluida(t.id)).length
          const blocoAnotacoes = anotacoes[bloco.id] || []

          return (
            <div key={bloco.id} className={styles.block}>
              <div className={styles.blockHeader}>
                <span className={styles.blockTitle}>{bloco.label}</span>
                <span className={`${styles.blockDeadline} ${late && pending > 0 ? styles.late : ''}`}>
                  até {bloco.deadline}
                </span>
              </div>

              {late && pending > 0 && (
                <div className={styles.alertCard}>
                  <AlertIcon />
                  <div className={styles.alertText}>
                    <strong>{pending} tarefa{pending > 1 ? 's' : ''} em atraso</strong>
                  </div>
                </div>
              )}

              {bloco.tarefas.sort((a, b) => a.ordem - b.ordem).map(tarefa => {
                const concluida = isConcluida(tarefa.id)
                const lista = checks[tarefa.id] || []
                const temChecks = lista.length > 0
                const overdue = late && !concluida
                const fotos = lista.flatMap(c => c.check_fotos || [])

                return (
                  <div key={tarefa.id}
                    className={`${styles.taskCard} ${overdue ? styles.overdue : ''} ${concluida ? styles.done : temChecks ? styles.partial : ''}`}>
                    <div className={styles.taskMain}>
                      <div
                        className={`${styles.checkBtn} ${concluida ? styles.checked : temChecks ? styles.checkedPartial : ''}`}
                        onClick={() => handleCheck(tarefa)}>
                        {concluida && <CheckIcon />}
                        {!concluida && temChecks && <HalfIcon />}
                      </div>
                      <div className={styles.taskBody}>
                        <div className={styles.taskName}>{tarefa.label}</div>
                        <div className={styles.taskTags}>
                          <span className={`${styles.timeTag} ${overdue ? styles.late : ''}`}>
                            <ClockIcon /> {bloco.deadline}
                          </span>
                          {lista.map(c => (
                            <span key={c.id}
                              className={styles.whoTag}
                              style={c.tipo === 'parcial' ? { background: '#FFF3CD', color: '#856404' } : {}}>
                              {c.colaboradores?.nome.split(' ')[0]}
                              {c.tipo === 'parcial' && ' ·'}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className={styles.camBtn}
                        onClick={() => {
                          if (fotos.length) {
                            setExpandedPhotos(p => ({ ...p, [tarefa.id]: !p[tarefa.id] }))
                          } else if (temChecks) {
                            setSheet({ type: 'photo-task', tarefaId: tarefa.id })
                          }
                        }}>
                        <CamIcon />
                        {fotos.length > 0 && <span className={styles.camBadge}>{fotos.length}</span>}
                      </div>
                    </div>
                    {expandedPhotos[tarefa.id] && fotos.length > 0 && (
                      <div className={styles.photosRow}>
                        {fotos.map(f => (
                          <img key={f.id} src={f.storage_path} className={styles.photoThumb} alt="" />
                        ))}
                        <div className={styles.photoAdd}
                          onClick={() => setSheet({ type: 'photo-task', tarefaId: tarefa.id })}>
                          <PlusIcon />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              <div className={styles.blockNotes}>
                {blocoAnotacoes.length > 0 && (
                  <div className={styles.notesList}>
                    {blocoAnotacoes.map(nota => (
                      <NoteItem key={nota.id} nota={nota} />
                    ))}
                  </div>
                )}
                <div className={styles.addNoteBtn}
                  onClick={() => setSheet({ type: 'note', blocoId: bloco.id })}>
                  <PlusIcon />
                  {blocoAnotacoes.length > 0 ? 'Adicionar anotação' : 'Adicionar anotação ao bloco'}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {sheet && (
        <SheetOverlay onClose={() => setSheet(null)}>
          {sheet.type === 'who-check' && (
            <WhoCheckSheet
              tarefa={sheet.tarefa}
              setorId={activeSetor}
              checksExistentes={checks[sheet.tarefa.id] || []}
              onSelect={(colabId, tipo) => confirmCheck(sheet.tarefa, colabId, tipo)}
              onClose={() => setSheet(null)}
            />
          )}
          {sheet.type === 'remove-check' && (
            <RemoveCheckSheet
              tarefa={sheet.tarefa}
              checks={checks[sheet.tarefa.id] || []}
              onAddMore={() => { setSheet({ type: 'who-check', tarefa: sheet.tarefa }) }}
              onRemoveAll={() => removeAllChecks(sheet.tarefa.id)}
              onClose={() => setSheet(null)}
            />
          )}
          {sheet.type === 'photo-task' && (
            <PhotoSheet
              onCamera={() => triggerFile('camera', f => { handleTaskPhoto(sheet.tarefaId, f); setSheet(null) })}
              onGallery={() => triggerFile('gallery', f => { handleTaskPhoto(sheet.tarefaId, f); setSheet(null) })}
              onClose={() => setSheet(null)}
            />
          )}
          {sheet.type === 'note' && (
            <NoteSheet
              blocoId={sheet.blocoId}
              setorId={activeSetor}
              currentUser={user}
              onSave={data => saveAnotacao(sheet.blocoId, data)}
              onClose={() => setSheet(null)}
            />
          )}
        </SheetOverlay>
      )}
    </div>
  )
}

// Sheet para escolher quem faz o check e se é parcial ou total
function WhoCheckSheet({ tarefa, setorId, checksExistentes, onSelect, onClose }) {
  const [colaboradores, setColaboradores] = useState([])
  const [selectedColab, setSelectedColab] = useState(null)
  const [tipo, setTipo] = useState('total')

  useEffect(() => {
    supabase.from('colaboradores')
      .select('id, nome, initials, color_idx')
      .eq('setor_id', setorId)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setColaboradores(data || []))
  }, [setorId])

  const jaFez = (colabId) => checksExistentes.some(c => c.colaborador_id === colabId)

  return (
    <>
      <div className={styles.sheetTitle}>Registrar check</div>
      <div className={styles.sheetSub}>{tarefa.label}</div>

      {checksExistentes.length > 0 && (
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:500,color:'#999',letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:6}}>Já registrado</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {checksExistentes.map(c => (
              <span key={c.id} style={{
                fontSize:12,fontWeight:500,padding:'4px 10px',borderRadius:10,
                background: c.tipo === 'total' ? '#EAF3DE' : '#FFF3CD',
                color: c.tipo === 'total' ? '#27500A' : '#856404'
              }}>
                {c.colaboradores?.nome.split(' ')[0]} {c.tipo === 'parcial' ? '(parcial)' : '✓'}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{fontSize:11,fontWeight:500,color:'#999',letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:8}}>Quem está fazendo?</div>
      <div className={styles.personGrid}>
        {colaboradores.map(c => {
          const p = paletteColor(c.color_idx)
          const fez = jaFez(c.id)
          return (
            <button key={c.id}
              className={`${styles.personBtn} ${selectedColab?.id === c.id ? styles.personBtnSel : ''}`}
              style={fez ? { opacity: 0.5 } : {}}
              onClick={() => !fez && setSelectedColab(c)}>
              <div className={styles.personAv} style={{ background: p.bg, color: p.fg }}>{c.initials}</div>
              <div className={styles.personName}>{c.nome.split(' ')[0]}</div>
              {fez && <div style={{fontSize:10,color:'#999'}}>já fez</div>}
            </button>
          )
        })}
      </div>

      {selectedColab && (
        <>
          <div style={{fontSize:11,fontWeight:500,color:'#999',letterSpacing:'0.5px',textTransform:'uppercase',margin:'14px 0 8px'}}>Tipo de check</div>
          <div style={{display:'flex',gap:8,marginBottom:16}}>
            <button
              onClick={() => setTipo('parcial')}
              style={{
                flex:1,padding:'12px 8px',borderRadius:10,border:`1.5px solid ${tipo==='parcial'?'#BA7517':'#e5e5e5'}`,
                background:tipo==='parcial'?'#FFF3CD':'white',cursor:'pointer'
              }}>
              <div style={{fontSize:14,fontWeight:500,color: tipo==='parcial'?'#856404':'#1a1a18'}}>Parcial</div>
              <div style={{fontSize:11,color:'#888',marginTop:2}}>Outro pode continuar</div>
            </button>
            <button
              onClick={() => setTipo('total')}
              style={{
                flex:1,padding:'12px 8px',borderRadius:10,border:`1.5px solid ${tipo==='total'?'#3B6D11':'#e5e5e5'}`,
                background:tipo==='total'?'#EAF3DE':'white',cursor:'pointer'
              }}>
              <div style={{fontSize:14,fontWeight:500,color: tipo==='total'?'#27500A':'#1a1a18'}}>Total</div>
              <div style={{fontSize:11,color:'#888',marginTop:2}}>Tarefa concluída</div>
            </button>
          </div>
          <button className={styles.saveBtn} onClick={() => onSelect(selectedColab.id, tipo)}>
            Confirmar check
          </button>
        </>
      )}
      <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
    </>
  )
}

// Sheet para ver checks existentes e remover
function RemoveCheckSheet({ tarefa, checks, onAddMore, onRemoveAll, onClose }) {
  return (
    <>
      <div className={styles.sheetTitle}>{tarefa.label}</div>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:500,color:'#999',letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:8}}>Checks registrados</div>
        {checks.map(c => {
          const p = paletteColor(c.colaboradores?.color_idx || 0)
          const time = new Date(c.feito_em).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
          return (
            <div key={c.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'0.5px solid #e5e5e5'}}>
              <div style={{width:32,height:32,borderRadius:'50%',background:p.bg,color:p.fg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:500,flexShrink:0}}>
                {c.colaboradores?.initials}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:500,color:'#1a1a18'}}>{c.colaboradores?.nome.split(' ')[0]}</div>
                <div style={{fontSize:11,color:'#999'}}>{time}</div>
              </div>
              <span style={{
                fontSize:11,fontWeight:500,padding:'3px 8px',borderRadius:8,
                background: c.tipo === 'total' ? '#EAF3DE' : '#FFF3CD',
                color: c.tipo === 'total' ? '#27500A' : '#856404'
              }}>
                {c.tipo === 'total' ? 'Total ✓' : 'Parcial'}
              </span>
            </div>
          )
        })}
      </div>
      <button className={styles.saveBtn} onClick={onAddMore}>
        + Adicionar outro check
      </button>
      <button className={styles.dangerBtn} onClick={onRemoveAll} style={{marginTop:8}}>
        Remover todos os checks
      </button>
      <button className={styles.cancelBtn} onClick={onClose}>Fechar</button>
    </>
  )
}

function PhotoSheet({ onCamera, onGallery, onClose }) {
  return (
    <>
      <div className={styles.sheetTitle}>Adicionar foto</div>
      <div className={styles.photoOpts}>
        <button className={styles.photoOpt} onClick={onCamera}>
          <CamIcon size={28} /><div className={styles.photoOptLabel}>Tirar foto</div>
        </button>
        <button className={styles.photoOpt} onClick={onGallery}>
          <GalleryIcon /><div className={styles.photoOptLabel}>Galeria</div>
        </button>
      </div>
      <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
    </>
  )
}

function NoteSheet({ blocoId, setorId, currentUser, onSave, onClose }) {
  const [person, setPerson] = useState(currentUser)
  const [texto, setTexto] = useState('')
  const [foto, setFoto] = useState(null)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioDur, setAudioDur] = useState(0)
  const [recording, setRecording] = useState(false)
  const [recorder, setRecorder] = useState(null)
  const [recSecs, setRecSecs] = useState(0)
  const [colaboradores, setColaboradores] = useState([])
  const [step, setStep] = useState('form')

  useEffect(() => {
    supabase.from('colaboradores').select('id, nome, initials, color_idx')
      .eq('setor_id', setorId).eq('ativo', true).order('nome')
      .then(({ data }) => setColaboradores(data || []))
  }, [setorId])

  async function startRec() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mr = new MediaRecorder(stream)
    const chunks = []
    mr.ondataavailable = e => chunks.push(e.data)
    mr.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' })
      setAudioBlob(blob)
      stream.getTracks().forEach(t => t.stop())
    }
    mr.start()
    setRecorder(mr)
    setRecording(true)
    let s = 0
    const iv = setInterval(() => { s++; setRecSecs(s) }, 1000)
    mr._interval = iv
  }

  function stopRec() {
    if (recorder) {
      clearInterval(recorder._interval)
      setAudioDur(recSecs)
      recorder.stop()
      setRecording(false)
    }
  }

  const canSave = person && (texto.trim() || foto || audioBlob)

  if (step === 'photo') return (
    <>
      <div className={styles.sheetTitle}>Foto para a anotação</div>
      <div className={styles.photoOpts}>
        <button className={styles.photoOpt} onClick={() => triggerFile('camera', f => { setFoto(f); setStep('form') })}>
          <CamIcon size={28} /><div className={styles.photoOptLabel}>Câmera</div>
        </button>
        <button className={styles.photoOpt} onClick={() => triggerFile('gallery', f => { setFoto(f); setStep('form') })}>
          <GalleryIcon /><div className={styles.photoOptLabel}>Galeria</div>
        </button>
      </div>
      <button className={styles.cancelBtn} onClick={() => setStep('form')}>Voltar</button>
    </>
  )

  if (step === 'audio') return (
    <>
      <div className={styles.sheetTitle}>Gravar áudio</div>
      <div className={styles.audioRec}>
        <div className={`${styles.recStatus} ${recording ? styles.recActive : ''}`}>
          {recording ? 'Gravando...' : audioBlob ? `Concluído · ${fmtTime(audioDur)}` : 'Pronto para gravar'}
        </div>
        <div className={styles.recTimer}>{fmtTime(recSecs)}</div>
        <div className={styles.recWave}>
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className={styles.recBar} style={{ height: recording ? `${6 + Math.random() * 20}px` : '8px' }} />
          ))}
        </div>
        <button className={styles.recBtn} onClick={recording ? stopRec : startRec}>
          {recording ? <StopIcon /> : <MicIcon size={22} />}
        </button>
      </div>
      {audioBlob && <button className={styles.saveBtn} onClick={() => setStep('form')}>Usar este áudio</button>}
      <button className={styles.cancelBtn} onClick={() => { setAudioBlob(null); setRecSecs(0); setStep('form') }}>
        {audioBlob ? 'Descartar e voltar' : 'Voltar'}
      </button>
    </>
  )

  return (
    <>
      <div className={styles.sheetTitle}>Nova anotação</div>
      <div className={styles.formGroup}>
        <div className={styles.formLabel}>Quem está anotando?</div>
        <div className={styles.personGrid}>
          {colaboradores.map(c => {
            const p = paletteColor(c.color_idx)
            return (
              <button key={c.id}
                className={`${styles.personBtn} ${person?.id === c.id ? styles.personBtnSel : ''}`}
                onClick={() => setPerson(c)}>
                <div className={styles.personAv} style={{ background: p.bg, color: p.fg }}>{c.initials}</div>
                <div className={styles.personName}>{c.nome}</div>
              </button>
            )
          })}
        </div>
      </div>
      <div className={styles.formGroup}>
        <div className={styles.formLabel}>Texto (opcional)</div>
        <textarea className={styles.textarea}
          value={texto} onChange={e => setTexto(e.target.value)}
          placeholder="Escreva uma observação..." />
      </div>
      <div className={styles.attachRow}>
        <button className={`${styles.attachBtn} ${foto ? styles.attachActive : ''}`} onClick={() => setStep('photo')}>
          <CamIcon size={16} /> {foto ? 'Foto adicionada' : 'Foto'}
        </button>
        <button className={`${styles.attachBtn} ${audioBlob ? styles.attachActive : ''}`} onClick={() => setStep('audio')}>
          <MicIcon /> {audioBlob ? `Áudio ${fmtTime(audioDur)}` : 'Áudio'}
        </button>
      </div>
      <button className={styles.saveBtn} disabled={!canSave}
        onClick={() => onSave({ texto, foto, audio: audioBlob })}>
        Salvar anotação
      </button>
      <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
    </>
  )
}

function NoteItem({ nota }) {
  const p = paletteColor(nota.colaboradores?.color_idx || 0)
  const time = new Date(nota.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return (
    <div className={styles.noteItem}>
      <div className={styles.noteHeader}>
        <div className={styles.noteAv} style={{ background: p.bg, color: p.fg }}>
          {nota.colaboradores?.initials || '?'}
        </div>
        <span className={styles.noteWho}>{nota.colaboradores?.nome.split(' ')[0]}</span>
        <span className={styles.noteTime}>{time}</span>
      </div>
      {nota.texto && <div className={styles.noteText}>{nota.texto}</div>}
      {nota.foto_path && <img src={nota.foto_path} className={styles.notePhoto} alt="" />}
      {nota.audio_path && <audio controls src={nota.audio_path} className={styles.noteAudio} />}
    </div>
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

function triggerFile(mode, callback) {
  const inp = document.createElement('input')
  inp.type = 'file'
  inp.accept = 'image/*'
  if (mode === 'camera') inp.capture = 'environment'
  inp.onchange = e => { if (e.target.files[0]) callback(e.target.files[0]) }
  inp.click()
}

function hasAlertSetor(setorId, blocos, checks, isConcluida) {
  return blocos.some(b => isLate(b.deadline) && b.tarefas.some(t => !isConcluida(t.id)))
}

function avatarStyle(ci) {
  const p = paletteColor(ci)
  return { background: p.bg, color: p.fg }
}

const CheckIcon = () => <svg width="10" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
const HalfIcon = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#856404" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
const AlertIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A32D2D" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="1" fill="#A32D2D" stroke="none"/></svg>
const ClockIcon = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const CamIcon = ({ size = 15 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><circle cx="12" cy="14" r="3"/><path d="M16 7l-1.5-3h-5L8 7"/></svg>
const GalleryIcon = () => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3B6D11" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
const MicIcon = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
const StopIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="none"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
const PlusIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const ConfigIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
// src/screens/ChecklistScreen.js
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase, uploadFile, storagePath } from '../lib/supabase'
import { isLate, today, nowTime, paletteColor, fmtTime } from '../lib/theme'
import styles from './ChecklistScreen.module.css'

export default function ChecklistScreen() {
  const { user, logout } = useAuth()
  const [setores, setSetores] = useState([])
  const [activeSetor, setActiveSetor] = useState(null)
  const [blocos, setBlocos] = useState([])
  const [checks, setChecks] = useState({}) // { tarefa_id: check }
  const [anotacoes, setAnotacoes] = useState({}) // { bloco_id: [] }
  const [sheet, setSheet] = useState(null) // { type, data }
  const [expandedPhotos, setExpandedPhotos] = useState({})

  // Carrega setores visíveis para o usuário
  useEffect(() => {
    const query = supabase.from('setores').select('*').eq('ativo', true).order('label')
    if (user.role === 'colaborador' || user.role === 'gerente') {
      query.eq('id', user.setor_id)
    }
    query.then(({ data }) => {
      setSetores(data || [])
      if (data?.length) setActiveSetor(data[0].id)
    })
  }, [user])

  const loadBlocos = useCallback(async (setorId) => {
    const { data } = await supabase
      .from('blocos')
      .select('*, tarefas(id, label, ordem)')
      .eq('setor_id', setorId)
      .order('ordem')
    setBlocos(data || [])

    // Carrega checks de hoje
    const tarefaIds = (data || []).flatMap(b => b.tarefas.map(t => t.id))
    if (tarefaIds.length) {
      const { data: checksData } = await supabase
        .from('checks')
        .select('*, colaboradores(nome, initials, color_idx), check_fotos(id, storage_path)')
        .in('tarefa_id', tarefaIds)
        .eq('data', today())
      const map = {}
      checksData?.forEach(c => { map[c.tarefa_id] = c })
      setChecks(map)
    }

    // Carrega anotações de hoje
    const blocoIds = (data || []).map(b => b.id)
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
    }
  }, [])

  useEffect(() => {
    if (activeSetor) loadBlocos(activeSetor)
  }, [activeSetor, loadBlocos])

  // Marca tarefa como feita
  async function handleCheck(tarefa) {
    const existing = checks[tarefa.id]
    if (existing) {
      // Desmarca
      await supabase.from('checks').delete().eq('id', existing.id)
      setChecks(prev => { const n = { ...prev }; delete n[tarefa.id]; return n })
      return
    }
    // Pede quem está fazendo
    setSheet({ type: 'who-check', tarefa })
  }

  async function confirmCheck(tarefa, colaboradorId) {
    const { data } = await supabase.from('checks').insert({
      tarefa_id: tarefa.id,
      colaborador_id: colaboradorId,
      data: today(),
    }).select('*, colaboradores(nome, initials, color_idx)').single()
    setChecks(prev => ({ ...prev, [tarefa.id]: data }))
    setSheet(null)
  }

  // Upload de foto para tarefa
  async function handleTaskPhoto(tarefaId, file) {
    const check = checks[tarefaId]
    if (!check) return
    const path = storagePath('fotos/checks', file.name.split('.').pop())
    const url = await uploadFile('fotos', path, file)
    await supabase.from('check_fotos').insert({ check_id: check.id, storage_path: url })
    // Recarrega
    loadBlocos(activeSetor)
  }

  // Salva anotação de bloco
  async function saveAnotacao(blocoId, { texto, foto, audio }) {
    const fotaPath = foto ? await uploadFile('fotos', storagePath('fotos/anotacoes', 'jpg'), foto) : null
    const audioPath = audio ? await uploadFile('audios', storagePath('audios', 'webm'), audio) : null
    const { data } = await supabase.from('anotacoes').insert({
      bloco_id: blocoId,
      colaborador_id: user.id,
      data: today(),
      texto: texto || null,
      foto_path: fotaPath,
      audio_path: audioPath,
    }).select('*, colaboradores(nome, initials, color_idx)').single()
    setAnotacoes(prev => ({
      ...prev,
      [blocoId]: [...(prev[blocoId] || []), data],
    }))
    setSheet(null)
  }

  const totalTasks = blocos.reduce((a, b) => a + b.tarefas.length, 0)
  const doneTasks = blocos.reduce((a, b) => a + b.tarefas.filter(t => checks[t.id]).length, 0)
  const pct = totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : 0

  return (
    <div className={styles.app}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <div className={styles.logo}><span>Giardino</span> checklists</div>
          <button className={styles.userPill} onClick={logout}>
            <div className={styles.pillAv} style={avatarStyle(user.color_idx)}>{user.initials}</div>
            <span>{user.nome.split(' ')[0]}</span>
          </button>
        </div>
        {setores.length > 1 && (
          <div className={styles.tabs}>
            {setores.map(s => (
              <button key={s.id}
                className={`${styles.tab} ${activeSetor === s.id ? styles.tabActive : ''}`}
                onClick={() => setActiveSetor(s.id)}>
                {s.label}
                {hasAlert(s.id, blocos, checks) && <span className={styles.tabDot} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div className={styles.body}>
        {/* Progress */}
        <div className={styles.progressCard}>
          <div className={styles.progressRow}>
            <span className={styles.progressLabel}>Progresso de hoje</span>
            <span className={styles.progressNums}>{doneTasks}/{totalTasks} tarefas</span>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Blocos */}
        {blocos.map(bloco => {
          const late = isLate(bloco.deadline)
          const pending = bloco.tarefas.filter(t => !checks[t.id]).length
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

              {/* Tarefas */}
              {bloco.tarefas.sort((a, b) => a.ordem - b.ordem).map(tarefa => {
                const check = checks[tarefa.id]
                const overdue = late && !check
                const fotos = check?.check_fotos || []

                return (
                  <div key={tarefa.id}
                    className={`${styles.taskCard} ${overdue ? styles.overdue : ''} ${check ? styles.done : ''}`}>
                    <div className={styles.taskMain}>
                      <div className={`${styles.checkBtn} ${check ? styles.checked : ''}`}
                        onClick={() => handleCheck(tarefa)}>
                        {check && <CheckIcon />}
                      </div>
                      <div className={styles.taskBody}>
                        <div className={styles.taskName}>{tarefa.label}</div>
                        <div className={styles.taskTags}>
                          <span className={`${styles.timeTag} ${overdue ? styles.late : ''}`}>
                            <ClockIcon /> {bloco.deadline}
                          </span>
                          {check?.colaboradores && (
                            <span className={styles.whoTag}>
                              {check.colaboradores.nome.split(' ')[0]}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={styles.camBtn}
                        onClick={() => {
                          if (fotos.length) {
                            setExpandedPhotos(p => ({ ...p, [tarefa.id]: !p[tarefa.id] }))
                          } else if (check) {
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

              {/* Anotações do bloco */}
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

      {/* Sheet overlay */}
      {sheet && (
        <SheetOverlay onClose={() => setSheet(null)}>
          {sheet.type === 'who-check' && (
            <WhoSheet
              tarefa={sheet.tarefa}
              setorId={activeSetor}
              onSelect={colabId => confirmCheck(sheet.tarefa, colabId)}
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
              onSave={data => saveAnotacao(sheet.blocoId, data)}
              onClose={() => setSheet(null)}
            />
          )}
        </SheetOverlay>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────

function WhoSheet({ tarefa, setorId, onSelect, onClose }) {
  const [colaboradores, setColaboradores] = useState([])
  useEffect(() => {
    supabase.from('colaboradores').select('id, nome, initials, color_idx')
      .eq('setor_id', setorId).eq('ativo', true).order('nome')
      .then(({ data }) => setColaboradores(data || []))
  }, [setorId])

  return (
    <>
      <div className={styles.sheetTitle}>Quem está fazendo?</div>
      <div className={styles.sheetSub}>{tarefa.label}</div>
      <div className={styles.personGrid}>
        {colaboradores.map(c => {
          const p = paletteColor(c.color_idx)
          return (
            <button key={c.id} className={styles.personBtn} onClick={() => onSelect(c.id)}>
              <div className={styles.personAv} style={{ background: p.bg, color: p.fg }}>{c.initials}</div>
              <div className={styles.personName}>{c.nome}</div>
            </button>
          )
        })}
      </div>
      <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
    </>
  )
}

function PhotoSheet({ onCamera, onGallery, onClose }) {
  return (
    <>
      <div className={styles.sheetTitle}>Adicionar foto</div>
      <div className={styles.photoOpts}>
        <button className={styles.photoOpt} onClick={onCamera}>
          <CamIcon size={28} />
          <div className={styles.photoOptLabel}>Tirar foto</div>
          <div className={styles.photoOptSub}>Câmera</div>
        </button>
        <button className={styles.photoOpt} onClick={onGallery}>
          <GalleryIcon />
          <div className={styles.photoOptLabel}>Da galeria</div>
          <div className={styles.photoOptSub}>Arquivo salvo</div>
        </button>
      </div>
      <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
    </>
  )
}

function NoteSheet({ blocoId, setorId, onSave, onClose }) {
  const [person, setPerson] = useState(null)
  const [texto, setTexto] = useState('')
  const [foto, setFoto] = useState(null)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioDur, setAudioDur] = useState(0)
  const [recording, setRecording] = useState(false)
  const [recorder, setRecorder] = useState(null)
  const [recSecs, setRecSecs] = useState(0)
  const [colaboradores, setColaboradores] = useState([])
  const [step, setStep] = useState('form') // form | photo | audio

  useEffect(() => {
    supabase.from('colaboradores').select('id, nome, initials, color_idx, role')
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

  return (
    <>
      {step === 'form' && (
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
              placeholder="Escreva uma observação sobre este bloco..." />
          </div>
          <div className={styles.attachRow}>
            <button className={`${styles.attachBtn} ${foto ? styles.attachActive : ''}`}
              onClick={() => setStep('photo')}>
              <CamIcon size={16} /> {foto ? 'Foto adicionada' : 'Foto'}
            </button>
            <button className={`${styles.attachBtn} ${audioBlob ? styles.attachActive : ''}`}
              onClick={() => setStep('audio')}>
              <MicIcon /> {audioBlob ? `Áudio ${fmtTime(audioDur)}` : 'Áudio'}
            </button>
          </div>
          <button className={styles.saveBtn} disabled={!canSave}
            onClick={() => onSave({ texto, foto, audio: audioBlob })}>
            Salvar anotação
          </button>
          <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
        </>
      )}

      {step === 'photo' && (
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
      )}

      {step === 'audio' && (
        <>
          <div className={styles.sheetTitle}>Gravar áudio</div>
          <div className={styles.audioRec}>
            <div className={`${styles.recStatus} ${recording ? styles.recActive : ''}`}>
              {recording ? 'Gravando...' : audioBlob ? `Gravação concluída · ${fmtTime(audioDur)}` : 'Pronto para gravar'}
            </div>
            <div className={styles.recTimer}>{fmtTime(recSecs)}</div>
            <div className={styles.recWave}>
              {Array.from({ length: 16 }).map((_, i) => (
                <div key={i} className={styles.recBar}
                  style={{ height: recording ? `${6 + Math.random() * 20}px` : '8px' }} />
              ))}
            </div>
            <button className={`${styles.recBtn} ${recording ? styles.recBtnStop : ''}`}
              onClick={recording ? stopRec : startRec}>
              {recording ? <StopIcon /> : <MicIcon size={22} />}
            </button>
          </div>
          {audioBlob && (
            <button className={styles.saveBtn} onClick={() => setStep('form')}>
              Usar este áudio
            </button>
          )}
          <button className={styles.cancelBtn} onClick={() => { setAudioBlob(null); setRecSecs(0); setStep('form') }}>
            {audioBlob ? 'Descartar e voltar' : 'Voltar'}
          </button>
        </>
      )}
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
      {nota.audio_path && (
        <audio controls src={nota.audio_path} className={styles.noteAudio} />
      )}
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

// Utilitário para disparar input de arquivo
function triggerFile(mode, callback) {
  const inp = document.createElement('input')
  inp.type = 'file'
  inp.accept = 'image/*'
  if (mode === 'camera') inp.capture = 'environment'
  inp.onchange = e => { if (e.target.files[0]) callback(e.target.files[0]) }
  inp.click()
}

function hasAlert(setorId, blocos, checks) {
  return blocos.some(b => isLate(b.deadline) && b.tarefas.some(t => !checks[t.id]))
}

function avatarStyle(ci) {
  const p = paletteColor(ci)
  return { background: p.bg, color: p.fg }
}

// SVG Icons
const CheckIcon = () => <svg width="10" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
const AlertIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A32D2D" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="1" fill="#A32D2D" stroke="none"/></svg>
const ClockIcon = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const CamIcon = ({ size = 15 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><circle cx="12" cy="14" r="3"/><path d="M16 7l-1.5-3h-5L8 7"/></svg>
const GalleryIcon = () => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3B6D11" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
const MicIcon = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
const StopIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="none"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
const PlusIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>

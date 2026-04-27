// src/lib/theme.js

export const PALETTE = [
  { dot: '#3B6D11', bg: '#EAF3DE', fg: '#27500A' }, // verde
  { dot: '#D85A30', bg: '#FAECE7', fg: '#712B13' }, // coral
  { dot: '#378ADD', bg: '#E6F1FB', fg: '#0C447C' }, // azul
  { dot: '#BA7517', bg: '#FAEEDA', fg: '#633806' }, // âmbar
  { dot: '#534AB7', bg: '#EEEDFE', fg: '#3C3489' }, // roxo
  { dot: '#0F6E56', bg: '#E1F5EE', fg: '#085041' }, // teal
  { dot: '#993556', bg: '#FBEAF0', fg: '#72243E' }, // pink
  { dot: '#A32D2D', bg: '#FCEBEB', fg: '#791F1F' }, // vermelho
  { dot: '#888780', bg: '#F1EFE8', fg: '#444441' }, // cinza
]

export function paletteColor(idx) {
  return PALETTE[idx % PALETTE.length]
}

export function barColor(pct) {
  if (pct >= 90) return '#3B6D11'
  if (pct >= 70) return '#BA7517'
  return '#E24B4A'
}

// Formata horário HH:MM
export function fmtTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Verifica se deadline já passou hoje
export function isLate(deadline) {
  const [h, m] = deadline.split(':').map(Number)
  const now = new Date()
  return now.getHours() > h || (now.getHours() === h && now.getMinutes() > m)
}

// Data de hoje no formato YYYY-MM-DD
export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// Hora atual HH:MM
export function nowTime() {
  const n = new Date()
  return `${n.getHours().toString().padStart(2, '0')}:${n.getMinutes().toString().padStart(2, '0')}`
}

// Iniciais de um nome
export function getInitials(nome) {
  return nome.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

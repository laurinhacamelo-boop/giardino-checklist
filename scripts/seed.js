// scripts/seed.js
// Rode: node scripts/seed.js
// Gera os hashes reais de PIN e mostra o SQL para inserir no Supabase

const bcrypt = require('bcryptjs')

async function main() {
  const colaboradores = [
    { nome: 'Ricardo Gomes', initials: 'RG', role: 'gestor',      setor: null,      pin: '1234', color_idx: 0 },
    { nome: 'Ana Lima',      initials: 'AL', role: 'gerente',     setor: 'salao',   pin: '2222', color_idx: 0 },
    { nome: 'Paulo Chef',    initials: 'PC', role: 'gerente',     setor: 'cozinha', pin: '3333', color_idx: 1 },
    { nome: 'Carlos Souza',  initials: 'CS', role: 'colaborador', setor: 'salao',   pin: '4444', color_idx: 2 },
    { nome: 'Fernanda Reis', initials: 'FR', role: 'colaborador', setor: 'salao',   pin: '5555', color_idx: 4 },
    { nome: 'Luciana Costa', initials: 'LC', role: 'colaborador', setor: 'cozinha', pin: '6666', color_idx: 5 },
    { nome: 'Maria Andrade', initials: 'MA', role: 'colaborador', setor: 'copa',    pin: '7777', color_idx: 6 },
    { nome: 'Sandra Neves',  initials: 'SN', role: 'colaborador', setor: 'limpeza', pin: '8888', color_idx: 7 },
  ]

  console.log('-- Cole este SQL no Supabase > SQL Editor\n')

  // Setores já foram inseridos no schema, apenas referenciamos os IDs fixos
  const setorIds = {
    salao:   '11111111-0000-0000-0000-000000000001',
    cozinha: '11111111-0000-0000-0000-000000000002',
    copa:    '11111111-0000-0000-0000-000000000003',
    limpeza: '11111111-0000-0000-0000-000000000004',
  }

  // Blocos e tarefas
  console.log(`
-- BLOCOS E TAREFAS
insert into blocos (setor_id, label, deadline, ordem) values
  ('${setorIds.salao}',   'Abertura',    '10:00', 0),
  ('${setorIds.salao}',   'Serviço',     '12:00', 1),
  ('${setorIds.salao}',   'Fechamento',  '23:00', 2),
  ('${setorIds.cozinha}', 'Pré-preparo', '09:00', 0),
  ('${setorIds.cozinha}', 'Serviço',     '11:30', 1),
  ('${setorIds.cozinha}', 'Fechamento',  '23:00', 2),
  ('${setorIds.copa}',    'Manhã',       '09:30', 0),
  ('${setorIds.copa}',    'Tarde',       '16:00', 1),
  ('${setorIds.limpeza}', 'Abertura',    '09:00', 0),
  ('${setorIds.limpeza}', 'Tarde',       '15:00', 1)
returning id, label, setor_id;
  `)

  console.log('-- (Após rodar o insert acima, anote os IDs dos blocos e rode o insert de tarefas)')
  console.log('-- Use o painel de configuração do app para adicionar as tarefas visualmente\n')

  // Colaboradores com hash real
  console.log('-- COLABORADORES')
  for (const c of colaboradores) {
    const hash = await bcrypt.hash(c.pin, 10)
    const setorRef = c.setor ? `'${setorIds[c.setor]}'` : 'null'
    console.log(`insert into colaboradores (nome, initials, role, setor_id, pin_hash, color_idx) values ('${c.nome}', '${c.initials}', '${c.role}', ${setorRef}, '${hash}', ${c.color_idx});`)
  }

  console.log('\n-- Pronto! Cole todos os inserts acima no Supabase SQL Editor.')
}

main().catch(console.error)

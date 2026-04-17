-- =============================================
-- GIARDINO CHECKLIST APP — SUPABASE SCHEMA
-- Cole este SQL no Supabase > SQL Editor > Run
-- =============================================

-- SETORES
create table setores (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  color_idx integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz default now()
);

-- BLOCOS (ex: Abertura, Serviço, Fechamento)
create table blocos (
  id uuid primary key default gen_random_uuid(),
  setor_id uuid references setores(id) on delete cascade,
  label text not null,
  deadline time not null default '10:00',
  alert_enabled boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz default now()
);

-- TAREFAS
create table tarefas (
  id uuid primary key default gen_random_uuid(),
  bloco_id uuid references blocos(id) on delete cascade,
  label text not null,
  ordem integer not null default 0,
  ativa boolean not null default true,
  criado_em timestamptz default now()
);

-- COLABORADORES (tabela própria, separada do auth)
create table colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  initials text not null,
  role text not null check (role in ('gestor','gerente','colaborador')),
  setor_id uuid references setores(id) on delete set null,
  pin_hash text not null, -- bcrypt hash do PIN
  color_idx integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz default now()
);

-- CHECKS DIÁRIOS
create table checks (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid references tarefas(id) on delete cascade,
  colaborador_id uuid references colaboradores(id) on delete set null,
  data date not null default current_date,
  feito_em timestamptz default now()
);
-- Garante 1 check por tarefa por dia
create unique index checks_tarefa_data_idx on checks(tarefa_id, data);

-- FOTOS DE CHECK
create table check_fotos (
  id uuid primary key default gen_random_uuid(),
  check_id uuid references checks(id) on delete cascade,
  storage_path text not null,
  criado_em timestamptz default now()
);

-- ANOTAÇÕES POR BLOCO
create table anotacoes (
  id uuid primary key default gen_random_uuid(),
  bloco_id uuid references blocos(id) on delete cascade,
  colaborador_id uuid references colaboradores(id) on delete set null,
  data date not null default current_date,
  texto text,
  foto_path text,
  audio_path text,
  criado_em timestamptz default now()
);

-- HISTÓRICO DE AUDITORIA
create table auditoria (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid references colaboradores(id) on delete set null,
  tipo text not null check (tipo in ('setor','bloco','tarefa','colab','config','check')),
  acao text not null,
  alvo text not null,
  setor_id uuid references setores(id) on delete set null,
  criado_em timestamptz default now()
);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
alter table setores enable row level security;
alter table blocos enable row level security;
alter table tarefas enable row level security;
alter table colaboradores enable row level security;
alter table checks enable row level security;
alter table check_fotos enable row level security;
alter table anotacoes enable row level security;
alter table auditoria enable row level security;

-- Política pública de leitura (o app controla acesso por PIN)
create policy "leitura publica" on setores for select using (true);
create policy "leitura publica" on blocos for select using (true);
create policy "leitura publica" on tarefas for select using (true);
create policy "leitura publica" on colaboradores for select using (true);
create policy "leitura publica" on checks for select using (true);
create policy "leitura publica" on check_fotos for select using (true);
create policy "leitura publica" on anotacoes for select using (true);
create policy "leitura publica" on auditoria for select using (true);

-- Política de escrita via service_role (app usa anon key + RLS)
create policy "escrita anon" on setores for all using (true) with check (true);
create policy "escrita anon" on blocos for all using (true) with check (true);
create policy "escrita anon" on tarefas for all using (true) with check (true);
create policy "escrita anon" on colaboradores for all using (true) with check (true);
create policy "escrita anon" on checks for all using (true) with check (true);
create policy "escrita anon" on check_fotos for all using (true) with check (true);
create policy "escrita anon" on anotacoes for all using (true) with check (true);
create policy "escrita anon" on auditoria for all using (true) with check (true);

-- =============================================
-- STORAGE BUCKETS
-- =============================================
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true);
insert into storage.buckets (id, name, public) values ('audios', 'audios', true);

-- Política de storage pública
create policy "storage publico fotos" on storage.objects for all using (bucket_id = 'fotos') with check (bucket_id = 'fotos');
create policy "storage publico audios" on storage.objects for all using (bucket_id = 'audios') with check (bucket_id = 'audios');

-- =============================================
-- DADOS INICIAIS
-- =============================================
-- PINs são hash bcrypt de: 1234, 2222, 3333, 4444, 5555
-- Use o seed.sql separado para inserir dados reais

insert into setores (id, label, color_idx) values
  ('11111111-0000-0000-0000-000000000001', 'Salão', 0),
  ('11111111-0000-0000-0000-000000000002', 'Cozinha', 1),
  ('11111111-0000-0000-0000-000000000003', 'Copa', 2),
  ('11111111-0000-0000-0000-000000000004', 'Limpeza', 3);

insert into colaboradores (nome, initials, role, setor_id, pin_hash, color_idx) values
  ('Ricardo Gomes', 'RG', 'gestor', null, '$2b$10$placeholder_hash_1234', 0),
  ('Ana Lima', 'AL', 'gerente', '11111111-0000-0000-0000-000000000001', '$2b$10$placeholder_hash_2222', 0),
  ('Paulo Chef', 'PC', 'gerente', '11111111-0000-0000-0000-000000000002', '$2b$10$placeholder_hash_3333', 1),
  ('Carlos Souza', 'CS', 'colaborador', '11111111-0000-0000-0000-000000000001', '$2b$10$placeholder_hash_4444', 2);

-- Nota: substitua os pin_hash pelo hash real gerado no seed.js

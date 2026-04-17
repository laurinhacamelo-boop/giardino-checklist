# Giardino Checklists — Guia de Publicação

## O que você vai precisar
- Conta gratuita em [supabase.com](https://supabase.com)
- Conta gratuita em [vercel.com](https://vercel.com)
- Conta gratuita em [github.com](https://github.com)
- Node.js instalado no seu computador ([nodejs.org](https://nodejs.org))

---

## Passo 1 — Configurar o Supabase (banco de dados)

1. Acesse [supabase.com](https://supabase.com) e clique em **Start your project**
2. Crie uma organização e um projeto chamado `giardino`
3. Escolha a região **South America (São Paulo)**
4. Anote a **senha do banco** (você vai precisar depois)
5. Aguarde o projeto inicializar (~2 min)

### Criar as tabelas
1. No menu lateral, clique em **SQL Editor**
2. Clique em **New query**
3. Copie todo o conteúdo do arquivo `supabase_schema.sql`
4. Cole no editor e clique em **Run**
5. Você deve ver "Success" em verde

### Inserir os dados iniciais
1. Ainda no SQL Editor, abra um novo terminal no seu computador
2. Navegue até a pasta do projeto: `cd giardino`
3. Instale as dependências: `npm install`
4. Rode o script: `node scripts/seed.js`
5. Copie os SQL gerados e cole no Supabase SQL Editor
6. Clique em **Run**

### Pegar as credenciais
1. No menu lateral, vá em **Settings > API**
2. Copie a **Project URL** (algo como `https://xxxxx.supabase.co`)
3. Copie a **anon/public key** (começa com `eyJ...`)
4. Guarde esses dois valores — você vai usar no próximo passo

---

## Passo 2 — Publicar o código no GitHub

1. Acesse [github.com](https://github.com) e crie um repositório chamado `giardino-checklist`
2. Na pasta do projeto no seu computador, rode:
```bash
git init
git add .
git commit -m "primeiro commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/giardino-checklist.git
git push -u origin main
```

---

## Passo 3 — Publicar na Vercel

1. Acesse [vercel.com](https://vercel.com) e faça login com sua conta GitHub
2. Clique em **Add New > Project**
3. Selecione o repositório `giardino-checklist`
4. Na seção **Environment Variables**, adicione:
   - `REACT_APP_SUPABASE_URL` = sua Project URL do Supabase
   - `REACT_APP_SUPABASE_ANON_KEY` = sua anon key do Supabase
5. Clique em **Deploy**
6. Aguarde ~2 minutos
7. Sua URL vai aparecer: algo como `giardino-checklist.vercel.app` 🎉

---

## Passo 4 — Instalar no celular como app

### iPhone
1. Abra o Safari e acesse a URL do app
2. Toque no ícone de compartilhar (quadrado com seta)
3. Role até "Adicionar à Tela de Início"
4. Toque em "Adicionar"
5. O ícone do Giardino vai aparecer na tela inicial

### Android
1. Abra o Chrome e acesse a URL do app
2. O Chrome vai mostrar automaticamente "Adicionar à tela inicial"
3. Ou toque nos 3 pontinhos > "Adicionar à tela inicial"
4. O ícone vai aparecer na tela inicial

---

## Passo 5 — Configurar o restaurante

1. Abra o app e faça login como **Ricardo Gomes** (PIN: 1234)
2. Acesse **Configurações**
3. Edite os setores para refletir a estrutura real do Giardino
4. Adicione os blocos e tarefas de cada setor
5. Atualize os colaboradores com os nomes e PINs reais
6. Distribua a URL para a equipe pelo WhatsApp

---

## Domínio personalizado (opcional)

Para ter uma URL como `app.giardino.com.br`:
1. Na Vercel, vá em **Settings > Domains**
2. Adicione seu domínio
3. A Vercel vai dar instruções para configurar o DNS no seu registrador de domínio

---

## Atualizações futuras

Sempre que você quiser atualizar o app:
```bash
git add .
git commit -m "descrição da mudança"
git push
```
A Vercel publica automaticamente em segundos. A equipe já recebe a nova versão na próxima vez que abrir o app.

---

## Suporte e custos

| Serviço | Plano gratuito inclui |
|---|---|
| Supabase | 500MB banco, 1GB storage, 50.000 requests/mês |
| Vercel | Projetos ilimitados, 100GB bandwidth/mês |
| GitHub | Repositórios ilimitados |

Para um restaurante como o Giardino, os planos gratuitos são mais que suficientes por bastante tempo. Se um dia precisar de mais, o Supabase Pro custa ~US$25/mês.

---

## Precisa de ajuda?

Se travar em algum passo, volte para o Claude e descreva onde parou — posso te guiar passo a passo.

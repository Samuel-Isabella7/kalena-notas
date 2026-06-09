# Deploy gratuito — Kalena Notas (Vercel + Render + Neon)

Arquitetura do plano grátis:
- **Frontend (Next.js)** → **Vercel** (grátis)
- **Backend (NestJS)** → **Render** (web service grátis — *hiberna* após ~15 min sem uso)
- **Banco (PostgreSQL)** → **Neon** (grátis)
- **Arquivos das notas** → **Google Drive** (obrigatório: o disco do Render é apagado a cada reinício)

> ⚠️ **Cold start:** no plano grátis do Render, a primeira pessoa a acessar depois de um tempo
> ocioso espera ~30–60s o servidor "acordar". Depois fica normal.
> ⚠️ **Captura SEFAZ:** como o backend hiberna, a captação roda **ao abrir o sistema / por botão
> "Sincronizar"**, não 24/7 (combinado com você).

---

## Passo 1 — Código no GitHub
1. Crie um repositório **privado** no GitHub (ex.: `kalena-notas`).
2. No projeto (já inicializei o git e fiz o 1º commit), conecte e envie:
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/kalena-notas.git
   git branch -M main
   git push -u origin main
   ```
   (O Git vai pedir login do GitHub no navegador na primeira vez.)

## Passo 2 — Banco no Neon
1. Acesse https://neon.tech e crie um projeto (região mais próxima).
2. Copie a **connection string** (algo como `postgresql://user:pass@...neon.tech/db?sslmode=require`).
3. Guarde — vai em `DATABASE_URL` no Render.

## Passo 3 — Backend no Render
1. Acesse https://render.com → **New** → **Blueprint** e conecte o repositório
   (ele lê o `render.yaml`). Ou **New → Web Service** apontando para `apps/api`.
2. Preencha as variáveis de ambiente (aba *Environment*):
   - `DATABASE_URL` = string do Neon
   - `CRIADOR_NOME`, `CRIADOR_EMAIL`, `CRIADOR_SENHA` = seu acesso inicial
   - `GOOGLE_SERVICE_ACCOUNT_JSON` + `GDRIVE_ROOT_FOLDER_ID` = Google Drive (ver README)
   - `OMIE_SP_*`, `OMIE_RJ_*` = credenciais Omie
   - `SMTP_*` = envio de e-mail (convites / esqueci a senha)
   - `GOOGLE_OAUTH_CLIENT_ID` = (opcional) login com Google
   - `CORS_ORIGIN` e `WEB_URL` = **deixe em branco por enquanto** (preenchemos no Passo 5)
3. Deploy. O backend roda `prisma migrate deploy` e cria o **criador automaticamente** no 1º boot.
4. Anote a URL pública (ex.: `https://kalena-notas-api.onrender.com`).

## Passo 4 — Frontend na Vercel
1. Acesse https://vercel.com → **Add New → Project** → importe o repositório.
2. Em **Root Directory**, selecione `apps/web`.
3. Variáveis de ambiente:
   - `NEXT_PUBLIC_API_URL` = `https://kalena-notas-api.onrender.com/api` (URL do Render + `/api`)
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID` = (opcional) mesmo Client ID do backend
4. Deploy. Anote a URL (ex.: `https://kalena-notas.vercel.app`).

## Passo 5 — Conectar os dois
1. Volte ao **Render** → variáveis:
   - `CORS_ORIGIN` = URL da Vercel (ex.: `https://kalena-notas.vercel.app`)
   - `WEB_URL` = a mesma URL da Vercel
2. Salve (o Render reinicia). Pronto: acesse a URL da Vercel e faça login com o criador.

## Passo 6 — Integrações (depois, sem pressa)
- **Google Drive** (obrigatório p/ arquivos): criar conta de serviço + compartilhar a pasta (README).
- **Omie** (SP/RJ): App Key/Secret (README).
- **SMTP** (Gmail/Workspace): senha de app para enviar convites e redefinição.
- **Login Google** (opcional): Client ID com a URL da Vercel autorizada.

---

## Atualizações futuras
A cada `git push` na branch `main`, **Vercel e Render publicam sozinhos** a nova versão.

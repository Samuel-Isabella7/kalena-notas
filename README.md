# Kalena Notas Fiscais

Sistema interno para **anexar notas fiscais por dia**, guardá-las no **Google Drive** e
**lançá-las como Conta a Pagar na Omie** (contas SP e RJ), após revisão.

- **Backend:** NestJS + Prisma + PostgreSQL
- **Frontend:** Next.js 14 (App Router) + Tailwind + ShadCN/UI + React Query
- **Integrações:** Google Drive (conta de serviço) e Omie (Contas a Pagar)

## Tipos de nota

Cada nota é classificada como **Serviço** ou **ICMS**. Esse tipo define quem enxerga a nota
(ver papéis abaixo) e fica visível por filtro no dia.

## Papéis de acesso

| Papel                    | Pode fazer                                                                       |
|--------------------------|----------------------------------------------------------------------------------|
| **Criador**              | Tudo: convidar/excluir membros, **anexar**, editar e **lançar na Omie**          |
| **Administrador**        | **Somente visualizar** notas de **Serviço e ICMS**                               |
| **Administrador Serviço**| **Somente visualizar** notas de **Serviço**                                       |
| **Administrador ICMS**   | **Somente visualizar** notas de **ICMS**                                          |

> Existe **um único criador** (você) — é o **único que anexa, edita e lança**. Os demais entram como
> administradores (somente leitura). O filtro por tipo é aplicado **no backend** — um administrador
> de ICMS não recebe nenhuma nota de serviço.

### Convite de membros
O criador convida pelo **e-mail** (e escolhe o perfil). A pessoa recebe um **link** para criar o
próprio cadastro (**nome e senha**). Sem SMTP configurado, o sistema exibe o link para o criador
copiar e enviar manualmente. Convites expiram em 7 dias e podem ser reenviados.

## Anos

O calendário começa em **junho/2026** e os **anos seguintes aparecem automaticamente** (2027, 2028…)
conforme o tempo passa — sem precisar mexer no sistema.

## Como funciona (fluxo de uma nota)

1. Abra o **Calendário** → escolha o **ano → mês → dia útil** (fins de semana e feriados ficam bloqueados).
2. Clique em **Anexar nota** e envie o PDF da NF.
3. O sistema salva o arquivo no **Google Drive** (subpastas `Ano/Mês/Dia`) e **lê o PDF** para
   pré-preencher fornecedor, CNPJ, valor, datas e número.
4. **Revise/corrija** os campos e selecione **categoria** e **conta corrente** da Omie.
5. O **criador** clica em **Lançar na Omie** → a nota vira uma **Conta a Pagar** na empresa escolhida (SP/RJ).

---

## Início rápido (Windows)

Depois que o sistema já foi instalado uma vez, basta dar **duplo clique em `iniciar.bat`**
(na raiz do projeto). Ele abre a API e o App em duas janelas e abre o navegador em
http://localhost:3001. Para **parar**, feche as duas janelas.

> Observação: este projeto já está configurado para usar o **PostgreSQL nativo** instalado
> nesta máquina (porta 5432). O `docker-compose.yml` (porta 5433) é uma alternativa.

## Pré-requisitos

- Node.js 20+ e npm 9+
- Docker (para o PostgreSQL de desenvolvimento)

## Setup local (passo a passo)

```bash
# 1. Subir o banco (Postgres na porta 5433)
docker compose up -d

# 2. Backend
cd apps/api
cp .env.example .env          # edite as variáveis (veja abaixo)
npm install
npx prisma migrate dev --name init
npx prisma db seed            # cria o usuário CRIADOR (ver .env)
npm run start:dev             # API em http://localhost:3334/api

# 3. Frontend (em outro terminal)
cd apps/web
cp .env.example .env.local
npm install
npm run dev                   # app em http://localhost:3001
```

> As dependências também podem ser instaladas de uma vez na raiz com `npm install` (workspaces).

**Login inicial:** use o e-mail/senha definidos em `CRIADOR_EMAIL` / `CRIADOR_SENHA` no `.env`
(padrão `criador@kalena.com.br` / `criador123`). **Troque a senha após o primeiro acesso.**

### Modo local (sem credenciais)

O sistema **roda mesmo sem** Google Drive e sem Omie configurados:
- Sem Drive → os arquivos são salvos em `apps/api/uploads/` (e podem ser visualizados pelo sistema).
- Sem Omie → o botão "Lançar" retorna um erro explicativo; o resto funciona normalmente.

Assim você consegue testar todo o fluxo antes de plugar as integrações.

---

## Configurar o Google Drive (conta de serviço)

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) e crie (ou use) um projeto.
2. Ative a **Google Drive API** (APIs e Serviços → Biblioteca → "Google Drive API" → Ativar).
3. Crie uma **Conta de Serviço** (APIs e Serviços → Credenciais → Criar credenciais → Conta de serviço).
4. Na conta de serviço, vá em **Chaves → Adicionar chave → JSON** e baixe o arquivo `.json`.
5. No **Google Drive**, crie a pasta onde as notas ficarão e **compartilhe** essa pasta com o
   **e-mail da conta de serviço** (algo como `...@...iam.gserviceaccount.com`) com permissão de **Editor**.
   - Recomendado: usar um **Drive Compartilhado** (Shared Drive) e adicionar a conta de serviço como membro — evita limites de cota da conta de serviço.
6. Pegue o **ID da pasta** (na URL `https://drive.google.com/drive/folders/<ID_DA_PASTA>`).
7. No `apps/api/.env`:
   ```env
   # cole o conteúdo do JSON em uma linha OU use GOOGLE_SERVICE_ACCOUNT_FILE com o caminho
   GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account", ...}
   GDRIVE_ROOT_FOLDER_ID=<ID_DA_PASTA>
   ```
   > Nunca versione esse JSON. O `.gitignore` já ignora `google-service-account.json` e `apps/api/credentials/`.

Confira em **Configurações** no app se o Google Drive aparece como conectado.

## Configurar a Omie (Contas a Pagar SP e RJ)

Para cada empresa (SP e RJ), no painel da Omie: **Configurações → API → Gerar App Key e App Secret**.

No `apps/api/.env`:
```env
OMIE_SP_APP_KEY=...
OMIE_SP_APP_SECRET=...
OMIE_RJ_APP_KEY=...
OMIE_RJ_APP_SECRET=...
```

O sistema usa:
- `IncluirContaPagar` (`/financas/contapagar/`) para criar o título a pagar;
- `ListarCategorias` e `ListarContasCorrentes` para preencher os seletores;
- `ConsultarCliente` / `IncluirCliente` para localizar ou criar o fornecedor pelo CNPJ.

Confira em **Configurações** no app se as contas SP/RJ aparecem como configuradas.

## Login, recuperação de senha e "Entrar com Google"

O sistema oferece **duas formas de login**:

1. **E-mail + senha** — cada pessoa entra com o e-mail cadastrado pelo criador.
2. **Entrar com Google** — a pessoa usa a conta Google dela. Por segurança, **só funciona para
   e-mails já cadastrados** como membros (e ativos); qualquer outro e-mail é recusado.

### Esqueci minha senha
Na tela de login há **"Esqueci minha senha"**: a pessoa informa o e-mail e recebe um **link**
(válido por 1 hora) para criar uma nova senha em `/redefinir-senha`.
- Com **SMTP configurado**, o link chega por e-mail.
- **Sem SMTP** (modo teste), o link aparece no **log da API** (e numa janela para copiar) —
  útil para testar antes de configurar o envio.

Configure o envio (recomendado Gmail/Google Workspace) no `apps/api/.env`:
```env
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="sistema@kalena.com.br"
SMTP_PASS="senha-de-app-de-16-digitos"   # gerada em myaccount.google.com > Segurança > Senhas de app
SMTP_FROM="Kalena Notas <sistema@kalena.com.br>"
WEB_URL="http://localhost:3001"          # em produção, a URL pública do app
```

### Configurar o "Entrar com Google"
1. No [Google Cloud Console](https://console.cloud.google.com/) → APIs e Serviços → **Credenciais**
   → Criar credenciais → **ID do cliente OAuth** → tipo **Aplicativo da Web**.
2. Em **Origens JavaScript autorizadas**, adicione a URL do app (ex.: `http://localhost:3001` e,
   em produção, `https://seu-dominio`).
3. Copie o **Client ID** e configure nos dois lados (mesmo valor):
   - `apps/api/.env` → `GOOGLE_OAUTH_CLIENT_ID="...apps.googleusercontent.com"`
   - `apps/web/.env.local` → `NEXT_PUBLIC_GOOGLE_CLIENT_ID="...apps.googleusercontent.com"`
4. Reinicie API e Web. O botão "Entrar com Google" aparece automaticamente quando o Client ID está configurado.

---

## Variáveis de ambiente

**Backend (`apps/api/.env`)** — veja `apps/api/.env.example` para a lista completa:
`DATABASE_URL`, `JWT_SECRET`, `PORT` (3334), `CORS_ORIGIN`, `WEB_URL`, `CRIADOR_*`,
`GOOGLE_SERVICE_ACCOUNT_JSON`/`GOOGLE_SERVICE_ACCOUNT_FILE`, `GDRIVE_ROOT_FOLDER_ID`,
`OMIE_SP_*`, `OMIE_RJ_*`, `SMTP_*` (envio de e-mail), `GOOGLE_OAUTH_CLIENT_ID` (login Google).

**Frontend (`apps/web/.env.local`)**: `NEXT_PUBLIC_API_URL` (ex.: `http://localhost:3334/api`)
e `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (mesmo Client ID do backend; vazio = botão Google oculto).

---

## Deploy na nuvem (acesso pela internet)

Sugestão simples (Railway/Render, ou uma VPS com Docker):

1. **Banco:** um PostgreSQL gerenciado. Use a connection string em `DATABASE_URL`.
2. **API:** build com `apps/api/Dockerfile`. O container roda `prisma migrate deploy` e sobe na porta `3334`.
   Configure todas as variáveis de ambiente (JWT, Google, Omie). Rode o seed uma vez para criar o criador:
   `npx prisma db seed`.
3. **Web:** build com `apps/web/Dockerfile`, passando `--build-arg NEXT_PUBLIC_API_URL=https://SUA-API/api`.
   Ajuste `CORS_ORIGIN` na API para o domínio público do front.
4. **HTTPS:** coloque ambos atrás de um domínio com TLS (o provedor normalmente já fornece).

> Para 7+ usuários simultâneos a stack é folgada. O ponto de atenção é a **cota de chamadas da Omie**
> (o lançamento é manual, então o volume é baixo).

## Estrutura do projeto

```
kalena-notas/
├── apps/
│   ├── api/   # NestJS (auth, users, invoices, omie, storage, pdf, calendar, settings)
│   └── web/   # Next.js (login, calendário, dia, membros, configurações)
├── docker-compose.yml
└── README.md
```

## Segurança e operação

- Autenticação JWT; senhas com bcrypt; RBAC (Criador/Admin) aplicado por guards no backend.
- Toda ação relevante (login, upload, edição, lançamento, gestão de membros) é registrada em `activity_logs`.
- Notas **já lançadas** na Omie ficam **somente leitura** e não podem ser excluídas/editadas.
- O lançamento é **sempre revisado** (o sistema lê o PDF e pré-preenche, mas você confirma antes).

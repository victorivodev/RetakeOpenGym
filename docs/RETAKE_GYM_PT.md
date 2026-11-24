# Retake Gym: como funciona, o que é e como integrar

Documento de referência do Retake Gym, para quem usa, mantém o servidor ou quer ligar outro
sistema a ele. Escrito a partir do código do repositório `victorivodev/RetakeOpenGym` (versão do
app 1.4.6, novembro de 2026).

Índice:

1. [O que é](#1-o-que-é)
2. [Funcionalidades](#2-funcionalidades)
3. [Arquitetura](#3-arquitetura)
4. [Dados e sincronização](#4-dados-e-sincronização)
5. [Rodar localmente](#5-rodar-localmente)
6. [Deploy na VPS e CI](#6-deploy-na-vps-e-ci)
7. [Variáveis de ambiente](#7-variáveis-de-ambiente)
8. [API e endpoints](#8-api-e-endpoints)
9. [Como integrar](#9-como-integrar)
10. [Scripts de manutenção](#10-scripts-de-manutenção)
11. [Cálculo da dieta](#11-cálculo-da-dieta)
12. [Segurança e limites](#12-segurança-e-limites)
13. [Licenças e mídia dos exercícios](#13-licenças-e-mídia-dos-exercícios)
14. [Onde mexer no código](#14-onde-mexer-no-código)

---

## 1. O que é

O **Retake Gym** é o app de treino, dieta e evolução corporal da **Retake Tecnologia**. Ele é um
fork de código aberto do [openGym](https://github.com/DuarteSantos8/openGym) (de Duarte Santos),
com a marca da Retake, o português do Brasil como idioma padrão e módulos próprios: dieta com IA
para registrar refeições, login com e-mail e senha, rede de amigos (feed, desafios, ranking) e o
tipo de treino.

- **Endereço:** <https://gym.retaketecnologia.com.br>
- **Servidor:** uma VPS da Oracle Cloud (plano Always Free), com os dados de todo mundo numa pasta
  `data/` no próprio servidor. Não há conta de terceiros nem telemetria.
- **Como se usa:** no navegador, instalado como PWA (Adicionar à tela de início, no Android e no
  iPhone) ou como **APK Android** baixado das releases do GitHub. Não está em loja de aplicativos.
- **Para quem:** um grupo fechado de amigos. O cadastro é por convite (`INVITE_ONLY=1`) e, por
  padrão, todo mundo no servidor é amigo de todo mundo.
- **Licença:** o código é AGPL-3.0-or-later, como o openGym. As animações dos exercícios são da Gym
  visual e têm licença própria (seção 13).

---

## 2. Funcionalidades

### 2.1 Treinos e rotinas

- **Rotinas** (treino A, B, C...) com exercícios, séries, repetições, carga, descanso, aquecimento
  e superséries. Edição em `RoutineEdit`, com arrastar para reordenar.
- **Agenda semanal ou rotativo:** a rotina pode estar presa a dias da semana ou girar numa sequência
  (A, B, C, descanso, A...). No rotativo, a semana aparece no início e tocar num dia escolhe treino
  ou descanso (`lib/rotation.js`, `lib/queue.js`).
- **Treino em andamento:** marca série por série, cronômetro de descanso com som, vibração e volume
  ajustável, notificação do descanso, troca de exercício no meio do treino, notas por série,
  calculadora de anilhas e halteres, aquecimento automático pela carga.
- **Progressão automática:** regras linear, Greyskull LP, dupla e tripla progressão e por tempo
  (`lib/progression.js`). Ao terminar o treino, as cargas avançam e os recordes (PR) são marcados
  (`lib/finish-workout.js`).
- **1RM estimado** por várias fórmulas (`lib/onerm.js`), histórico por exercício, gráficos de
  volume, recordes e mapa de músculos trabalhados, com modelo de recuperação muscular
  (`lib/recovery.js`).
- **Tipo de treino** (exclusivo do Retake Gym): "Normal" (padrão), "Mais carga, menos repetição"
  ou "Mais repetição, menos carga". Escolhido num chip embaixo do nome do treino que está sendo
  feito e salvo no treino como `style`. É só um rótulo: não muda o que a progressão decide
  (`lib/routine-style.js`). Treinos antigos sem o campo leem o tipo da rotina.
- **Programas prontos** (`views/Programmes.jsx`) e importação de planos.

### 2.2 Exercícios livres e funcional

- **Biblioteca** com 5.632 exercícios do catálogo (com nomes e instruções traduzidos) mais os
  exercícios criados pela pessoa, com foto, GIF ou vídeo próprios (guardados no servidor, só o dono
  vê).
- Exercícios **com peso do corpo**, **com tempo** (prancha, isometria), **cardio** com distância e
  duração, e com carga assistida ou adicional. Isso cobre treino livre e funcional dentro da mesma
  estrutura de rotinas e séries.
- Ainda não há modo dedicado de circuito, AMRAP, EMOM ou Tabata (está no roteiro do openGym).

### 2.3 Corpo e evolução

- **Peso corporal** com linha de meta e tendência; o início mostra o cartão do peso.
- **Medidas** (circunferências e campos próprios com unidade cm, in, %, kg, lb ou nenhuma), uma
  medição por dia (`lib/measurements.js`).
- **Fotos de progresso** com comparação lado a lado.
- **Desafios do mês:** três metas pequenas por mês, calculadas a partir de como a pessoa treina
  (`lib/challenges.js`), sem cobrança quando não dá.

### 2.4 Dieta e IA das refeições (exclusivo do Retake Gym)

- **Aba Dieta:** calorias e macros do dia contra a meta, água, refeições por horário (café da manhã,
  almoço, lanche, jantar, ceia) e navegação entre dias (`views/Diet.jsx`).
- **Meta:** sexo, altura, ano de nascimento, nível de atividade, objetivo (perder peso, manter,
  ganhar massa, recomposição), ritmo semanal e refeições livres por semana. As contas estão na
  seção 11.
- **Registrar refeição** (`views/MealLog.jsx`): por **foto**, por **texto** ("arroz, feijão e um
  filé de frango") ou à mão. Com a IA ligada, o servidor manda a foto e/ou o texto para o
  **Google Gemini**, que devolve os alimentos com porção em gramas, calorias, proteína, carboidrato,
  gordura, fibra e uma confiança. Tudo aparece para revisão antes de salvar: dá para corrigir a
  porção (os valores são recalculados proporcionalmente) ou apagar itens.
- A foto **não é guardada** no servidor: passa direto para o provedor de IA.
- **Água:** meta de 35 ml por kg de peso (arredondada a 50 ml; 2.000 ml sem peso registrado).
- **TDEE adaptativo:** depois de 14 dias com comida registrada em pelo menos 70% deles e duas
  pesagens, o app estima o gasto real pelo que foi comido e como o peso andou.

### 2.5 Rede de amigos (exclusivo do Retake Gym)

- **Feed:** posts de treino, refeição, peso, recorde ou texto, com **uma foto por post**, reações e
  comentários. O cartão do treino ou da refeição vai junto com o post.
- **Amigos:** busca por nome ou @usuário, pedidos de amizade, perfil de cada pessoa
  (`views/SocialPerson.jsx`). Com `SOCIAL_EVERYONE_FRIENDS` ligado (padrão), todo mundo no servidor
  é amigo de todo mundo e desfazer amizade fica bloqueado.
- **Visibilidade do perfil:** privado, amigos (padrão) ou público.
- **Ranking semanal** (a partir de segunda-feira): dias treinados, volume em kg, sequência de dias
  seguidos e progresso até a meta de peso. Quem não quer aparecer desliga em "mostrar nos rankings".
- **Desafios entre amigos:** alguém cria um desafio de N dias, os outros entram e fazem check-in
  por dia; no fim aparece quem ganhou (fica visível por uma semana).
- **Cutucar** um amigo e **notificações** (curtidas, comentários, pedidos).
- **Convite de app:** qualquer membro gera um link `https://gym.retaketecnologia.com.br/?convite=CÓDIGO`;
  a conta criada por ele já começa amiga de quem convidou, mesmo com cadastro só por convite.
- Datas usam o **dia local do celular** (o servidor roda em UTC e o Brasil está 3 horas atrás).

### 2.6 Login e contas

- **E-mail e senha** (`EMAIL_LOGIN=1`): cadastro com nome, @usuário único, e-mail, senha (mínimo de
  10 caracteres, senhas óbvias recusadas) e código de convite. Entrada pelo e-mail ou pelo
  @usuário.
- **No APK** o login é o mesmo, sem código de pareamento (rotas `/api/app/*`, que devolvem um
  token).
- **Esqueceu a senha:** o admin gera um código em *Painel de administração → a pessoa → Redefinir
  senha*; a pessoa digita em *Esqueceu a senha?*. O dono do servidor usa o `set-login.js`
  (seção 10).
- **Admin:** a primeira conta criada (`FIRST_USER_ADMIN=1`) vira administradora. O painel (em
  português) lista usuários, desativa contas, gera e revoga convites, mostra o registro de atividade
  e configura o Coach de IA.
- Passkeys (chave de acesso) continuam existindo no código, herdadas do openGym, mas não são o
  caminho do Retake Gym.
- Foto de perfil, nome e @usuário em *Configurações*. "Sair de todos os aparelhos" encerra todas as
  sessões.

### 2.7 Outras coisas herdadas do openGym

- **Coach de IA opcional** (desligado até um admin ligar; Anthropic, OpenAI, Gemini ou compatível
  com OpenAI). Ver `docs/AI_COACH.md`.
- **Lembretes** de dia de treino e do descanso por Web Push (no navegador).
- **Temas, cor de destaque e ícones alternativos** do app (Original, Light, Mono, Gold, Blue...).
- **Módulos:** dá para esconder partes do app (`docs/MODULES.md`).
- **Modo convidado** desligado no Retake Gym (`ALLOW_GUEST=0`).

### 2.8 Onde roda

| Forma | Como instalar | Observações |
|---|---|---|
| Navegador / PWA | abrir o site e "Adicionar à tela de início" | funciona no iPhone e no Android, offline e sincroniza ao voltar |
| APK Android | baixar `RetakeGym-<versão>.apk` nas releases do GitHub | servidor já preenchido; o app avisa quando há versão nova; lê frequência cardíaca e pesagens do Health Connect |
| iPhone nativo | não publicado | precisaria da conta Apple Developer (US$ 99/ano) ou Mac com Xcode |
| Relógio | Wear OS e Garmin têm apps no código (`frontend/android/wear`, `frontend/garmin`) | não publicados pelo Retake; Amazfit GTS 2 e Galaxy Fit 3 não rodam apps de terceiros |

Limite conhecido do APK: não há push de verdade (sem Firebase Cloud Messaging). Os avisos da rede
de amigos aparecem como notificação local só enquanto o app está aberto ou volta para a frente.

---

## 3. Arquitetura

```
Celular / navegador
   │  HTTPS
   ▼
Caddy (portas 80/443, certificado Let's Encrypt automático)
   │
   ▼
web: nginx com o app React já compilado + /exercise-media/ (GIFs 180 px)
   │  /api/*
   ▼
api: Node.js (node:http, sem framework)  ──►  Google Gemini (só a IA das refeições)
   │
   ▼
pasta data/ no disco da VPS (JSON)
```

Três containers definidos em `deploy/docker-compose.yml`: `caddy`, `web` e `api`.

### 3.1 Frontend (`frontend/`)

- **React 19 + Vite**, roteamento com `react-router-dom`, estado com **Zustand**. Sem TypeScript.
- `src/store/useStore.js`: o estado do app (`S`), salvo no `localStorage` (`gym_state_v1`) e
  enviado ao servidor quando a pessoa está logada. `src/store/useUI.js`: estado passageiro da tela.
- `src/lib/`: regras puras, cada uma com teste ao lado (`*.test.js`). Progressão, 1RM, recuperação,
  dieta (`nutrition.js`), rede social (`social.js`), tipo de treino (`routine-style.js`), rotativo
  (`rotation.js`) e o único ponto que fala com o servidor (`api.js`).
- `src/views/`: uma tela por arquivo (`Home`, `Plan`, `Workout`, `Diet`, `MealLog`, `Social`,
  `Stats`, `Settings`, `Admin`...).
- `src/locales/`: um pacote de idioma por língua, com o texto em inglês como chave. O pt-BR é o
  padrão de todo perfil novo.
- `src/retake-brand.css`: a identidade visual da Retake (dourado `#e8cc85`, azul `#32658a`, fundo
  escuro, fonte Overpass) por cima do tema do openGym.
- **Capacitor 8** gera os apps nativos (`frontend/android`, `frontend/ios`).

### 3.2 Backend (`api/`)

- `server.js`: servidor HTTP puro. As rotas ficam num objeto `routes` com chave `'MÉTODO /caminho'`.
  Toda rota está documentada em `api/openapi.yaml` (um teste compara os dois).
- Módulos ao lado: `password.js` (senhas com scrypt), `rate-limit.js` (freio de tentativas),
  `social.js` (regras da rede de amigos), `meals/analyze.js` (IA das refeições), `media.js` (fotos
  e vídeos dos exercícios próprios), `durable.js` (gravação segura em disco), `sync-stamps.js`
  (mescla da sincronização), `coach/` (Coach de IA), `integrations/` (webhooks).
- Dependências de produção poucas e intencionais (`@simplewebauthn/server`, `web-push`, SDKs de IA).

### 3.3 "Banco de dados"

Não há banco SQL. Tudo é JSON na pasta `DATA_DIR` (`/data` no container, `~/retakegym/data` na
VPS), gravado em arquivo temporário e depois renomeado, para não corromper:

| Arquivo | Conteúdo |
|---|---|
| `db.json` | contas (nome, @usuário, e-mail, hash da senha, foto), passkeys, convites, assinaturas de push |
| `state-<id>.json` | o documento de cada perfil: rotinas, treinos, pesagens, medidas, dieta, refeições, água, configurações |
| `social.json` | feed, amizades, desafios, cutucadas, convites de app, notificações |
| `social-photos/` | uma foto por post |
| `uploads/<perfil>/` | fotos e vídeos dos exercícios criados pela pessoa |
| `secret` | chave que assina os cookies de sessão (perder = todo mundo deslogado) |
| `vapid.json` | chaves do Web Push |
| `audit.log` | registro de atividade (logins, ações de admin) |
| `coach.json`, `coach/` | Coach de IA, quando ligado (credenciais cifradas) |

**Backup = copiar `data/` e o `.env`** (seção 6.4).

### 3.4 Mídia dos exercícios

As animações e fotos dos exercícios (180 × 180 px) estão em `catalogue/media/` e entram na imagem
`web`, que as serve em `/exercise-media/`. O crédito "© Aliaksandr Makatserchyk, Gym visual" aparece
em *Configurações*. Regras de uso na seção 13.

---

## 4. Dados e sincronização

- Cada perfil é **um documento** com um número de revisão (`_rev`) no servidor.
- O app trabalha offline sobre o `localStorage` e envia o documento com `PUT /api/data`, dizendo a
  revisão que viu por último (`baseRev`).
- Se outro aparelho gravou no meio, o servidor responde **409** com o documento atual; o app mescla
  campo a campo (`frontend/src/lib/sync-merge.js`, espelhado em `api/sync-stamps.js`) e tenta de
  novo. Cada mudança tem seu carimbo de tempo, então a edição mais nova de cada campo ganha e o que
  foi apagado continua apagado (refeições apagadas ficam como `{ gone: true }`).
- Enquanto está aberto, o app pergunta `GET /api/data/rev` a cada meio minuto e só baixa o documento
  quando o número muda.
- A rede de amigos **não** está nesse documento: fica em `social.json` e é lida pelas rotas
  `/api/social/*`. O ranking é calculado no servidor a partir dos treinos de cada um.

Formato resumido do que importa no documento do perfil:

```js
{
  _rev: 384,
  unit: 'kg',
  routines: [{ id, name, exercises: [...], style? }],
  workouts: [{ id, d: '2026-11-20', name, routineId, style: 'normal'|'load'|'reps', entries: [{ ex, sets: [{ w, r, done }] }] }],
  bodyweight: [{ d: '2026-11-20', w: 82.4 }],
  targetW: 78,
  diet: { sex, heightCm, birthYear, activity, goal, ratePerWeekKg, freeMealsPerWeek },
  meals: { '<id>': { date, slot, items: [{ name, grams, kcal, protein, carbs, fat, fiber }], source, _ts } },
  water: { '2026-11-20': { ml: 1500, _ts } },
  rotation: { id, sequence: ['<rotinaA>', '<rotinaB>', 'rest'], label }
}
```

---

## 5. Rodar localmente

Requisitos: Node 22 e Docker (opcional).

**Tudo junto, com Docker:**

```bash
cp .env.example .env          # RP_ID=localhost, ORIGIN=http://localhost:8080
# para testar o login por e-mail e a IA, acrescente no .env:
#   EMAIL_LOGIN=1
#   FIRST_USER_ADMIN=1
#   GEMINI_API_KEY=<sua chave de teste>
docker compose up -d --build
# abra http://localhost:8080
```

**Desenvolvendo o frontend com recarga automática:**

```bash
cd api && npm install && EMAIL_LOGIN=1 FIRST_USER_ADMIN=1 DATA_DIR=./data-dev node server.js   # porta 3000
cd frontend && npm install && npm run dev                                                      # Vite, com /api apontando para :3000
```

**Testes e verificações (os mesmos da CI):**

```bash
cd frontend && npm test                      # vitest, a suíte inteira
cd frontend && npx vitest run src/lib/nutrition.test.js
cd api && npm test                           # node --test
cd frontend && node scripts/check-locales.mjs && node scripts/check-source-strings.mjs --strict
node scripts/build-api-docs.mjs --check      # openapi.yaml em dia com as rotas
```

**APK local:** `cd frontend && npm run build:mobile` e abrir `frontend/android` no Android Studio
(detalhes em `docs/MOBILE.md`). Na prática, o APK oficial sai da CI (seção 6.3).

---

## 6. Deploy na VPS e CI

O passo a passo completo, da conta Oracle ao primeiro acesso, está em
[DEPLOY_PT.md](DEPLOY_PT.md). Aqui fica o resumo.

### 6.1 A máquina

- Oracle Cloud Always Free, região São Paulo, shape **VM.Standard.E2.1.Micro** (1 GB de memória;
  o `install.sh` cria 3 GB de swap para o build caber).
- Ubuntu, usuário `ubuntu`, app na pasta `~/retakegym`.
- DNS na Hostinger: registro **A** `gym` apontando para o IP público da VPS.
- Portas 80 e 443 abertas na Security List da Oracle (manual) e no iptables (o script faz).

### 6.2 `deploy/install.sh`

Rodado com `sudo bash deploy/install.sh`, faz, nesta ordem:

1. cria swap se a máquina tiver menos de 3 GB;
2. instala o Docker se faltar;
3. abre 80/443 no firewall da máquina;
4. na primeira vez, pergunta o domínio e a chave do Gemini e escreve o `.env` (com `EMAIL_LOGIN=1`,
   `FIRST_USER_ADMIN=1`, `INVITE_ONLY=1`, `ALLOW_GUEST=0`, `DEFAULT_LANG=pt-BR`,
   `MEAL_AI_DAILY_CAP=40`); nas outras vezes mantém o `.env`;
5. `git pull --ff-only`;
6. `docker compose -f deploy/docker-compose.yml up -d --build`.

Rodar de novo é a forma de atualizar: não mexe em `data/` nem no `.env`.

### 6.3 GitHub Actions

| Workflow | Quando roda | O que faz |
|---|---|---|
| `deploy-vps.yml` (Deploy VPS) | todo push na `main` (PR mergeado) e manual | entra na VPS por SSH, deixa a pasta na `main` nova, roda `sudo bash deploy/install.sh` e testa `/api/health` |
| `android-apk.yml` (Android APK) | todo push na `main`, tag `v*` e manual | compila, assina e publica a release `RetakeGym-<versão>.apk` com `.sha256`; a versão é a do `frontend/package.json` se ainda não tem tag, senão a última tag com o último número +1 |
| `test.yml` | pull requests | testes do frontend, da API, do MCP e as verificações |
| `vps-edit-routines.yml` (Editar rotinas, VPS) | manual | roda `scripts/edit-routines.mjs` na VPS (ensaio ou gravação, com backup) |
| `vps-routine-style.yml` | manual | roda a classificação do tipo de treino na VPS |

- Mudanças só em `docs/`, `website/` ou arquivos `.md` não disparam deploy nem APK.
- `[sem apk]` na mensagem do merge pula o APK.
- Os workflows usam secrets do repositório (nomes, nunca valores): `VPS_SSH_KEY`, `VPS_HOST`,
  `VPS_USER`, `VPS_SSH_KNOWN_HOSTS` para a VPS; `ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` para assinar o APK. Todo APK é assinado com a
  mesma chave, então a versão nova instala por cima e mantém os dados. **Perder a chave de
  assinatura obriga todo mundo a desinstalar e instalar de novo.**

### 6.4 Operação do dia a dia

```bash
cd ~/retakegym
sudo docker compose -f deploy/docker-compose.yml logs -f --tail 100      # ver logs
sudo docker compose -f deploy/docker-compose.yml restart api             # reiniciar a API
sudo tar czf ~/retakegym-backup-$(date +%F).tgz data .env                 # backup
sudo nano .env && sudo bash deploy/install.sh                             # mudar configuração
```

Baixe o backup para fora da VPS de vez em quando (`scp`). O `.env` tem a chave do Gemini e o
`data/` tem as senhas (em hash) e os dados de todos: trate os dois como confidenciais.

---

## 7. Variáveis de ambiente

Ficam no `.env` da raiz (na VPS, `~/retakegym/.env`). As principais do Retake Gym:

| Variável | Valor no Retake Gym | Para que serve |
|---|---|---|
| `DOMAIN` | `gym.retaketecnologia.com.br` | endereço que o Caddy atende e para o qual tira o certificado |
| `RP_ID` / `ORIGIN` | o domínio / `https://` + domínio | identidade do site; o servidor só aceita escrita vinda do `ORIGIN` |
| `RP_NAME` | `Retake Gym` | nome mostrado |
| `DEFAULT_LANG` | `pt-BR` | idioma de quem ainda não escolheu |
| `EMAIL_LOGIN` | `1` | login com e-mail/@usuário e senha, sem passkey e sem pareamento |
| `FIRST_USER_ADMIN` | `1` | a primeira conta vira admin |
| `ADMIN_UIDS` | (vazio) | ids de outros admins, separados por vírgula |
| `INVITE_ONLY` | `1` | cadastro exige código de convite (`0` abre para qualquer um) |
| `ALLOW_GUEST` | `0` | tira o botão "continuar sem conta" |
| `SOCIAL_EVERYONE_FRIENDS` | (padrão ligado) | todo mundo é amigo de todo mundo; `0` volta aos pedidos de amizade |
| `GEMINI_API_KEY` | chave do Google AI Studio | liga a IA das refeições |
| `ANTHROPIC_API_KEY` | (vazio) | alternativa ao Gemini |
| `MEAL_AI_PROVIDER` | (vazio) | `gemini` ou `anthropic`, quando as duas chaves existem |
| `MEAL_AI_MODEL` | (vazio) | modelo; padrão `gemini-3.8-flash`, com troca automática para outro Flash se o modelo cair |
| `GEMINI_BACKEND` | (vazio) | `gemini` ou `vertex`, fixa o backend do Google |
| `MEAL_AI_DAILY_CAP` | `40` | análises de refeição por pessoa por dia |
| `SESSION_DAYS` | 90 (padrão) | quanto dura um login |
| `TRUST_PROXY` | `1` (no compose) | lê o IP real do cabeçalho, para o freio de tentativas |
| `PASSWORD_LOGIN` | (herdado) | senha ao lado de passkey, no modelo do openGym |
| `AUDIT_LOG`, `AUDIT_MAX`, `AUDIT_DAYS`, `AUDIT_IP` | padrão | registro de atividade |
| `MEDIA_UPLOADS`, `MEDIA_QUOTA_MB`, `MEDIA_*_MAX_MB` | padrão | fotos e vídeos dos exercícios próprios |
| `INTEGRATIONS` | (desligado) | `webhook` liga os webhooks |
| `VAPID_SUBJECT` | padrão | contato para os serviços de push |
| `COACH_DISABLED` | (vazio) | trava de segurança do Coach de IA |

Definidas no próprio `deploy/docker-compose.yml`: `PORT=3000`, `DATA_DIR=/data`, `TRUST_PROXY=1`,
`NGINX_PORT`, `BACKEND`, `MEDIA_UPLOAD_MAX=48m`, `CF_CONNECTING_IP`. A lista completa e comentada
está em `.env.example`.

No build do APK (`android-apk.yml`), `VITE_DEFAULT_SERVER=https://gym.retaketecnologia.com.br`
deixa o servidor já preenchido no app.

---

## 8. API e endpoints

Todas as rotas começam com `/api`, respondem JSON e estão descritas em
[`api/openapi.yaml`](../api/openapi.yaml) (e em `docs/API.md`). Erros têm o formato
`{ "error": "texto", "code": "opcional" }`. Os mais comuns: `401` sem login, `403` sem permissão ou
conta desativada, `409` conflito, `429` limite atingido, `503` recurso desligado no servidor.

### 8.1 Público e sessão

| Rota | Descrição |
|---|---|
| `GET /api/health` | servidor de pé (usado pelo deploy) |
| `GET /api/config` | o que está ligado: `email_login`, `invite_only`, `allow_guest`, `meal_ai`, `coach`, `integrations`, `media`, `default_lang`... |
| `GET /api/me` | quem está logado |
| `POST /api/logout`, `POST /api/logout/all` | sair deste aparelho / de todos |

### 8.2 Login e conta (e-mail e senha)

| Rota | Descrição |
|---|---|
| `POST /api/register/password` | cadastro pelo site: `name`, `username`, `email`, `password`, `code` (convite). Responde com cookie |
| `POST /api/login/password` | login pelo site: `identifier` (e-mail ou @usuário) e `password`. Responde com cookie |
| `POST /api/app/register`, `POST /api/app/login` | o mesmo para o app e para integrações: responde `{ token, user }` |
| `POST /api/login/password-reset`, `POST /api/app/password-reset` | troca a senha com o código dado pelo admin |
| `GET/POST/DELETE /api/account/password` | ver, definir ou remover a senha |
| `POST/DELETE /api/account/email` | definir ou remover o e-mail |
| `POST /api/account/profile`, `POST/GET /api/account/avatar` | nome, @usuário e foto |
| `POST /api/account/delete` | apagar a conta |

### 8.3 Dados do perfil

| Rota | Descrição |
|---|---|
| `GET /api/data` | o documento inteiro: `{ state, rev }` |
| `GET /api/data/rev` | só a revisão |
| `PUT /api/data` | grava: `{ state, baseRev }`; `409` com o documento atual se outra gravação passou na frente |
| `PUT/GET /api/media/{hash}`, `POST /api/media/missing`, `POST /api/media/sweep` | fotos e vídeos dos exercícios próprios |

### 8.4 Dieta

| Rota | Descrição |
|---|---|
| `POST /api/meals/analyze` | analisa uma refeição. Corpo: foto (data URL JPEG, PNG, WebP ou GIF, até 3 MB) e/ou texto (até 1.000 caracteres) e o idioma. Resposta: `{ title, notes, items: [{ name, grams, kcal, protein, carbs, fat, fiber, confidence }] }`. Não grava nada: o app salva a refeição no documento do perfil depois da revisão. `503 code=off` sem chave de IA, `429 code=cap` no limite diário |

### 8.5 Rede de amigos

| Rota | Descrição |
|---|---|
| `GET /api/social?today=AAAA-MM-DD&q=busca` | feed (50 posts), amigos, pedidos, busca, notificações |
| `GET /api/social/unread`, `POST /api/social/seen` | contador de não lidas |
| `GET /api/social/person` | perfil de uma pessoa |
| `PUT /api/social/profile` | visibilidade, aparecer no ranking |
| `POST /api/social/friend`, `/friend/accept`, `/friend/remove` | amizades |
| `POST /api/social/invite`, `/invite/redeem` | convite de amizade |
| `POST /api/social/app-invite` | convite para criar conta já como amigo |
| `POST /api/social/post`, `/post/delete`, `GET /api/social/photo` | posts (`kind`: workout, meal, weight, record, text; texto até 500 caracteres; uma foto até 400 KB) |
| `POST /api/social/react`, `/comment`, `/comment/delete` | reações e comentários |
| `GET /api/social/ranking` | ranking da semana |
| `GET/POST /api/social/challenges`, `/challenges/join`, `/leave`, `/checkin` | desafios entre amigos |
| `POST /api/social/poke` | cutucar |

### 8.6 Admin

`GET /api/admin/users`, `GET /api/admin/user`, `POST /api/admin/user/disable`, `/delete`, `/role`,
`/recovery`, `/password-reset`, `GET /api/admin/invites`, `POST /api/admin/invites/new`, `/revoke`,
`GET /api/admin/audit`, `POST /api/admin/audit/clear`, `POST /api/admin/owner` e as rotas
`/api/admin/coach/*`. Só respondem para admins.

### 8.7 Outras

- **Push:** `/api/push/public-key`, `/subscribe`, `/status`, `/unsubscribe`, `/test`, `/rest-timer`.
- **Relógios:** `/api/watch/pair`, `/redeem`, `/links`, `/unlink`, `/snapshot`, `/events`, `/ack`,
  `/box`.
- **Pareamento de aparelho (modelo openGym):** `/api/pair/create`, `/api/pair/redeem`,
  `/api/device-link/*`.
- **Integrações:** `/api/integrations`, `/connect`, `/disconnect`, `/update`, `/test`, `/retry`,
  `/log`.
- **Coach de IA:** `/api/coach/*`.
- **Passkeys (herdado):** `/api/register/options|verify`, `/api/login/options|verify`,
  `/api/account/passkeys/*`.

---

## 9. Como integrar

### 9.1 Autenticar um sistema seu

Para um script, painel ou outro app falar com a API, use o mesmo caminho do APK:

```bash
# 1. pegar um token (uma conta de verdade do servidor)
curl -s https://gym.retaketecnologia.com.br/api/app/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"@seuusuario","password":"<senha>"}'
# => { "token": "...", "user": { ... } }

# 2. usar o token
curl -s https://gym.retaketecnologia.com.br/api/data -H "Authorization: Bearer $TOKEN"
curl -s "https://gym.retaketecnologia.com.br/api/social/ranking?today=$(date +%F)" -H "Authorization: Bearer $TOKEN"
```

- O token vale como uma sessão normal (`SESSION_DAYS`, 90 dias por padrão). "Sair de todos os
  aparelhos" ou trocar a senha o invalida.
- Requisições de escrita vindas de um **navegador** precisam vir do próprio site (proteção contra
  CSRF). Com `Authorization: Bearer` válido e sem cookie, a verificação de origem não se aplica.
- Guarde o token como uma senha. Ele dá acesso total ao perfil.

### 9.2 Escrever dados (treinos, refeições, pesagens)

Não há rota por item: o perfil é um documento só. Para gravar:

1. `GET /api/data` → `{ state, rev }`;
2. altere o `state` (por exemplo, acrescente um item em `workouts`, `bodyweight` ou `meals`, com
   `_ts: Date.now()` nos mapas carimbados);
3. `PUT /api/data` com `{ state, baseRev: rev }`;
4. se vier `409`, repita do passo 1 com o documento devolvido.

O jeito mais seguro de montar um treino é usar o mesmo código do app: o servidor MCP (`mcp/`) faz
exatamente isso na ferramenta `log_workout`, montando o treino com
`frontend/src/lib/log-workout.js`. Ver `mcp/README.md`.

### 9.3 Receber eventos (webhooks)

Com `INTEGRATIONS=webhook` no `.env`, cada pessoa pode cadastrar até 10 URLs em *Configurações →
Integrações → Webhooks*. Eventos: `workout.finished`, `workout.pr`, `weighin.logged`. Cada envio é
um JSON assinado com um segredo mostrado uma vez só. Serve para Home Assistant, n8n, ntfy,
Node-RED, Zapier e afins. Detalhes do formato e da assinatura em
[INTEGRATIONS.md](INTEGRATIONS.md). URLs de rede interna são recusadas, a menos que
`INTEGRATIONS_ALLOW_LAN=1`.

### 9.4 Relógios e saúde

- **Health Connect (Android) / Apple Health:** o APK lê frequência cardíaca dos treinos e pesagens
  e escreve os treinos. Amazfit (Zepp) e Samsung Health escrevem no Health Connect, então dados
  desses relógios chegam por aí.
- **Wear OS e Garmin:** há apps no código (`frontend/android/wear`, `frontend/garmin`), que falam
  pelo protocolo de `lib/watch-sync.js` e pelas rotas `/api/watch/*`. Não são publicados pelo Retake
  hoje.
- **Amazfit GTS 2 e Galaxy Fit 3** não aceitam apps de terceiros; o caminho para eles é o Health
  Connect.
- **Exportar para Garmin:** arquivo `.fit` do treino (`lib/fit-export.js`).

### 9.5 Importar treinos de outros apps

Em *Configurações → Integrações / Importar*: Hevy (pela chave da API do Hevy), Strong, FitNotes,
Liftosaur, StrongLifts, Fitbod, JEFIT e CSV próprio. Exportação em CSV dos treinos e das medidas, e
backup completo do perfil. Detalhes em [DATA_IMPORTS.md](DATA_IMPORTS.md).

### 9.6 IA (MCP e Coach)

- **Servidor MCP** (`mcp/`): deixa um assistente de IA (Claude Desktop, por exemplo) ler os dados de
  um perfil direto do `DATA_DIR` e registrar treinos. Roda ao lado do servidor, não na imagem Docker.
- **Coach de IA:** ligado pelo admin no painel; ver [AI_COACH.md](AI_COACH.md).
- A IA das refeições usa o Gemini por decisão do projeto (a Retake já tem conta Google).

---

## 10. Scripts de manutenção

Todos rodam **na VPS**, dentro da pasta `~/retakegym`. Faça backup de `data/` antes de qualquer
um que grave.

### `api/set-login.js`: e-mail, @usuário e senha de um perfil

```bash
# só trocar a senha (pergunta duas vezes, sem mostrar)
sudo docker compose -f deploy/docker-compose.yml exec api node set-login.js "seu@email.com"
# dar e-mail e @usuário a um perfil antigo (de passkey) e definir a senha
sudo docker compose -f deploy/docker-compose.yml exec api node set-login.js "Nome" --email voce@exemplo.com --username nome
```

Opções: `--id <id do perfil>` (quando há nomes repetidos), `--password-stdin`, `--no-password`.
Fala com o servidor em execução por um socket local de admin, então não precisa parar a API. Uma
senha nova desloga o perfil de todos os aparelhos. É a forma do dono do servidor recuperar a
própria senha (nenhum admin pode redefinir a do dono).

### `scripts/edit-routines.mjs`: pôr e tirar exercícios das rotinas

Recebe um arquivo de mudanças em `scripts/routine-changes/` (exemplo: `ombro-2026-11.json`). O jeito
fácil é a aba **Actions → Editar rotinas (VPS) → Run workflow**: sem marcar "gravar" é só um ensaio
que mostra as rotinas; marcado, faz backup, para a API, grava e sobe a API.

### `scripts/set-routine-style.mjs`: classificar o tipo de treino

Classificação única das rotinas antigas pelas repetições. Já foi rodado; os comandos estão em
[DEPLOY_PT.md](DEPLOY_PT.md#classificar-o-tipo-dos-treinos-uma-vez-só) e no workflow
`vps-routine-style.yml`.

### Lançar treinos anotados no papel

O script `scripts/add-workouts.mjs` (no branch `claude/project-thread-kexje3`, ainda fora da `main`)
lança treinos escritos à mão no perfil de alguém e pode copiar as rotinas de outro perfil
(`--plan-from`). Roda na imagem `retakegym-api:local` com a API parada.

### Outros (herdados)

`api/recover.js` (recuperar acesso de um perfil), `scripts/catalogue/build.mjs` (gerar a biblioteca
de exercícios a partir de `catalogue/`), `scripts/build-api-docs.mjs` (documentação da API).

---

## 11. Cálculo da dieta

Tudo em `frontend/src/lib/nutrition.js`, com testes em `nutrition.test.js`. Peso em kg, altura em
cm, energia em kcal, macros em gramas.

**1. Metabolismo basal (Mifflin-St Jeor):**

```
TMB = 10 × peso + 6,25 × altura − 5 × idade + 5      (homens)
TMB = 10 × peso + 6,25 × altura − 5 × idade − 161    (mulheres)
```

**2. Gasto total (TDEE) = TMB × fator de atividade:**

| Nível | Fator |
|---|---|
| Sedentário | 1,2 |
| Leve (1 a 3 treinos por semana) | 1,375 |
| Moderado (3 a 5) | 1,55 |
| Ativo (6 a 7) | 1,725 |
| Atleta (duas vezes por dia) | 1,9 |

**3. Meta de calorias pelo objetivo:**

- **Perder peso:** o déficit da semana é `ritmo (kg/semana) × 7.700 kcal`, dividido só pelos **dias
  de dieta** (`7 − refeições livres por semana`; padrão 1 refeição livre, então 6 dias), com **10%
  de margem**:

  ```
  déficit diário = ritmo × 7700 / dias de dieta × 1,1
  meta = TDEE − déficit diário
  ```

  A meta nunca fica abaixo de **1.500 kcal (homens) ou 1.200 kcal (mulheres)**. Se o ritmo pedido
  exigir menos que isso, o app avisa e mostra o ritmo que o piso ainda permite. O dia da refeição
  livre fica perto da manutenção. Ritmo padrão: 0,5 kg por semana.
- **Ganhar massa:** `TDEE + ritmo × 7700 / 7`, limitado a +15% do TDEE (ritmo padrão 0,25 kg/semana).
- **Recomposição:** `TDEE × 0,9`.
- **Manter:** o TDEE.
- A meta é arredondada para dezenas.

**4. Macros:**

- Proteína: 2,0 g/kg (perder ou recomposição), 1,8 g/kg (ganhar), 1,6 g/kg (manter).
- Gordura: 25% das calorias, no mínimo 0,6 g/kg.
- Carboidrato: o que sobra.
- Fibra: 14 g a cada 1.000 kcal.

**Exemplo:** homem, 85 kg, 178 cm, 30 anos, moderado, perder 0,5 kg/semana, 1 refeição livre.
TMB = 850 + 1.112,5 − 150 + 5 = 1.817,5 ≈ 1.818. TDEE = 1.818 × 1,55 ≈ 2.818. Déficit = 0,5 × 7.700 /
6 × 1,1 ≈ 706. Meta ≈ 2.110 kcal. Proteína 170 g, gordura 59 g, carboidrato ≈ 225 g.

**5. Conferência dos itens da IA:** cada item é limitado a valores plausíveis e, se as calorias
informadas diferirem mais de 25% das calorias calculadas pelos macros (4/4/9), o app usa as
calculadas.

**6. TDEE adaptativo:** com pelo menos 14 dias entre a primeira e a última pesagem, refeições em 70%
dos dias e duas pesagens, `TDEE real = média ingerida − inclinação do peso (kg/dia) × 7.700`, com a
inclinação por mínimos quadrados para um dia salgado não estragar a conta.

---

## 12. Segurança e limites

### Segurança

- **HTTPS** obrigatório (Caddy com Let's Encrypt). Sem HTTPS não há login.
- **Senhas** guardadas só como hash **scrypt** (N = 2^15, r = 8, p = 1, com sal). Mínimo de 10
  caracteres, máximo de 256; senhas repetitivas e comuns são recusadas.
- **Freio de tentativas** por conta e por endereço, com espera que dobra a cada erro
  (`api/rate-limit.js`). O IP real chega pelo Caddy (`CF_CONNECTING_IP=$http_x_forwarded_for`), para
  um visitante errando não travar o login de todos.
- **Sessão** num cookie assinado com HMAC (`data/secret`), `SameSite=Lax`; no app, o mesmo
  conteúdo como token Bearer. Duração padrão de 90 dias.
- **CSRF:** escrita vinda de navegador só é aceita quando vem do `ORIGIN`.
- **Cadastro só por convite**, sem modo convidado. Convites têm 64 bits aleatórios e valem uma vez.
- **Privacidade entre perfis:** cada um só lê o próprio documento. Na rede de amigos, o que aparece
  depende da visibilidade (privado, amigos, público). Admins conseguem ver o histórico de treino
  dos usuários pelo painel.
- **Registro de atividade** (`data/audit.log`) com logins e ações de admin; IPs desligados por
  padrão.
- **Webhooks** não podem apontar para a rede interna (a menos que liberado).
- **Segredos:** a chave do Gemini fica só no `.env` da VPS; as chaves SSH e de assinatura do APK só
  nos secrets do GitHub. Nada disso vai para o repositório, que é público.

### Limites

| O quê | Limite |
|---|---|
| Análises de refeição com IA | 40 por pessoa por dia (`MEAL_AI_DAILY_CAP`), zera à meia-noite UTC (21h no horário de Brasília) |
| Foto da refeição | 3 MB; texto da refeição até 1.000 caracteres |
| Post no feed | texto até 500 caracteres, 1 foto até 400 KB, 20 posts por hora por pessoa; o servidor guarda os 2.000 posts mais recentes |
| Mídia dos exercícios próprios | 200 MB por perfil; foto 2 MB, GIF 8 MB, vídeo 40 MB e 60 s |
| Webhooks | 10 por perfil |
| Servidor | VPS de 1 GB: aguenta um grupo pequeno de amigos. O build de cada deploy leva alguns minutos e usa swap |
| APK | sem push real (sem FCM); cerca de 225 MB; instalação manual (fontes desconhecidas) |
| iPhone | só PWA |
| Contador de IA | fica na memória: reiniciar a API zera o contador do dia |

---

## 13. Licenças e mídia dos exercícios

- **Código:** AGPL-3.0-or-later, herdada do openGym. Quem oferece o app pela internet precisa
  disponibilizar o código-fonte com as mudanças, o que já acontece porque o repositório é público.
  O aviso de copyright do openGym (Duarte Santos) tem que continuar.
- **Animações e fotos dos exercícios:** da **Gym visual** (© Aliaksandr Makatserchyk,
  gymvisual.com). **Não** estão na AGPL. O NOTICE do openGym permite que um fork **sem fins
  comerciais** mantenha a mídia original de 180 px com o aviso, e a Gym visual confirmou por e-mail
  que o Retake Gym pode usar enquanto o app não for vendido. Guarde esse e-mail como prova.
- Regras práticas: só arquivos de 180 px no repositório, na CI, na imagem web e no servidor;
  nada de tamanhos maiores, nada de links diretos para fora, nada de passar a mídia para ferramentas
  de IA; o crédito continua em *Configurações*.
- **Vender o app ou cobrar assinatura** exige uma licença paga da Gym visual (ou trocar a mídia).
- O desenho do mapa de músculos vem do MuscleMap (MIT). Detalhes em [NOTICE.md](../NOTICE.md).

---

## 14. Onde mexer no código

| Quero mudar... | Arquivo |
|---|---|
| contas da dieta | `frontend/src/lib/nutrition.js` (+ teste) |
| tela da dieta / registrar refeição | `frontend/src/views/Diet.jsx`, `MealLog.jsx` |
| prompt e provedores da IA das refeições | `api/meals/analyze.js` |
| regras da rede de amigos | `api/social.js` (servidor), `frontend/src/lib/social.js` (app) |
| telas do feed e dos amigos | `frontend/src/views/Social.jsx`, `SocialPerson.jsx`, `components/SocialParts.jsx` |
| tipo de treino | `frontend/src/lib/routine-style.js` |
| login por e-mail | `api/server.js` (rotas `passwordRoutes`), `api/password.js`, `frontend/src/views/Login.jsx` |
| visual da Retake | `frontend/src/retake-brand.css`, ícones gerados por `frontend/scripts/app-icons.mjs` |
| textos em português | `frontend/src/locales/pt-BR.js` (e `pt.js`) |
| deploy | `deploy/install.sh`, `deploy/docker-compose.yml`, `.github/workflows/deploy-vps.yml` |
| APK | `.github/workflows/android-apk.yml`, `frontend/android/` |
| nova rota da API | `api/server.js` + `api/openapi.yaml` |

Regras do projeto que valem para qualquer mudança:

- Regra de treino ou de dieta é função pura em `frontend/src/lib/` com teste ao lado.
- Mudou a mescla da sincronização? Mude `frontend/src/lib/sync-merge.js` e `api/sync-stamps.js`
  juntos.
- Texto novo na tela vai para todos os pacotes de idioma.
- Poucas dependências: biblioteca nova só com muito motivo.
- Nunca commitar `data/`, `.env`, chaves ou mídia maior que 180 px.

Outros documentos: [DEPLOY_PT.md](DEPLOY_PT.md) (colocar no ar),
[ARCHITECTURE.md](ARCHITECTURE.md) (arquitetura do openGym, em inglês),
[SELF_HOSTING.md](SELF_HOSTING.md), [INTEGRATIONS.md](INTEGRATIONS.md),
[DATA_IMPORTS.md](DATA_IMPORTS.md), [MOBILE.md](MOBILE.md).

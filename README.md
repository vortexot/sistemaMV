# MV Multimarcas

Loja com painel administrativo, catálogo e Mídia Indoor, construída com
**FastAPI + MongoDB** e **Vite + React 19 + TypeScript**. O frontend acessa o backend
pelo prefixo `/api`. As seções Mídia Indoor e Como alterar as informações visuais
da página abaixo explicam a operação e personalização. As demais seções descrevem
as convenções técnicas herdadas do projeto.

## Layout

```
farm-ts/
  backend/   FastAPI + motor (async MongoDB) + Pydantic v2 — python, /root/.venv
  frontend/  Vite + React 19 + Tailwind v4 + shadcn/ui (TypeScript strict)
  tests/     Playwright e2e workspace (pre-scaffolded)
```

## Running

### Inicialização local preparada neste Windows

Abra `INICIAR-PROJETO.cmd` com dois cliques. Ele executa `iniciar.ps1`, que inicia
MongoDB, backend e frontend em segundo plano e verifica o catálogo pela API.
Depois abra `http://localhost:3000`. Se as portas já estiverem em uso, o script
reaproveita os processos existentes. O backend é iniciado sem hot reload;
alterações Python precisam de reinício.

O MongoDB portátil fica em `.local/mongodb`, os dados em `.local/mongo-data`
e os logs em `.local/`. Não apague a pasta de dados para reiniciar.
O banco escuta somente em `127.0.0.1:27017`. Após reiniciar o computador,
execute o atalho novamente. Os uploads ficam em `backend/storage/uploads`.
Esse preparo é local: ao copiar o projeto para outra máquina, é necessário
instalar uv, Node, dependências e preparar o MongoDB novamente.

O binário vem da [distribuição oficial do MongoDB](https://www.mongodb.com/try/download/community-edition/releases),
seguindo a [instalação por ZIP no Windows](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-windows-zip/).

No Windows com uv instalado, abra dois terminais PowerShell na pasta do projeto:

```powershell
# Terminal 1: backend
cd backend
& "$env:USERPROFILE\.local\bin\uv.exe" run --python 3.12 --with-requirements requirements.txt uvicorn server:app --port 8001 --reload
```

```powershell
# Terminal 2: frontend
cd frontend
npm run dev
```

Abra `http://localhost:3000`. O MongoDB configurado em `backend/.env` precisa estar
disponível. Erros `ECONNREFUSED` no proxy `/api` indicam que o backend não está
escutando na porta 8001. A dependência antiga `emergentintegrations` foi removida:
nenhum módulo deste backend a utiliza; autenticação externa e PayPal usam `httpx`.

Two separate processes, managed by supervisor in the pod (see "Pod conventions"
below); to run them by hand from two terminals instead:

```bash
cd backend && uvicorn server:app --host 0.0.0.0 --port 8001 --reload   # http://localhost:8001
cd frontend && yarn dev                                                # http://localhost:3000
```

## The `/api` proxy convention

Every backend route lives under `/api` (the backend mounts one
`APIRouter(prefix="/api")`), and the frontend dev server
(`frontend/vite.config.ts`) proxies `/api/*` to `http://localhost:8001`. So
frontend code always calls a **relative** path — `apiGet("/status")` →
`/api/status` — and never an absolute backend URL. The same code works in dev
(via the Vite proxy) and in production (once both are served behind a single
origin).

## Backend

FastAPI, async throughout. `python` is the app venv interpreter
(`/root/.venv/bin/python`); backend deps are pip-installed from
`backend/requirements.txt`.

- **Entry point**: `backend/server.py` — creates `app = FastAPI()`, creates
  `api_router = APIRouter(prefix="/api")`, registers routes **on the router**,
  and calls `app.include_router(api_router)` at the bottom. CORS middleware is
  added from `CORS_ORIGINS`. Never hang a route directly off `app` — it would
  land outside `/api` and the Vite proxy would not reach it.
- **The route pattern** (copy `status` in `server.py`):
  1. a Pydantic model per request body and per response
     (`StatusCheckCreate` / `StatusCheck`);
  2. an `async def` handler decorated with
     `@api_router.post("/status", response_model=StatusCheck)`;
  3. `await` the motor call inside it.
  FastAPI validates the request against the Pydantic model before your handler
  runs — a malformed body never reaches your code, it gets an automatic `422`
  with a `{"detail": [...]}` body.
- **Growing the backend**: as `server.py` gets crowded, move models to
  `backend/models/` and routers to `backend/routers/` (one module per resource,
  each exporting its own `APIRouter`, mounted from `server.py` via
  `api_router.include_router(...)` or `app.include_router(...)` with the `/api`
  prefix preserved).
- **MongoDB**: import the shared handle — `from lib.db import client, db`
  (`backend/lib/db.py` self-loads `.env` before reading env). Use it from
  `server.py`, every router, and standalone scripts like `seed.py`; never
  construct another `AsyncIOMotorClient`. Collections are attributes:
  `await db.status_checks.insert_one(...)`, `await db.status_checks.find().to_list(1000)`.
  Motor connects lazily, so importing `server` never blocks on Mongo. `pymongo`
  is installed too if you need a sync client in a script.
- **Ids**: documents use a string `id` (`uuid4`) field, not Mongo's `ObjectId`
  — `ObjectId` is not JSON-serializable and leaks into response bodies. Keep the
  `uuid4` default-factory pattern from `StatusCheck`.
- **Config**: `backend/.env` — `MONGO_URL` (connection string), `DB_NAME`
  (database name), `CORS_ORIGINS`. `server.py` loads it with `python-dotenv`
  above its local imports, and `lib/db.py` self-loads it so standalone scripts
  inherit it too. The pod runs `mongod` locally, so `MONGO_URL` points at
  `localhost`. Add new secrets/config here; read them with `os.environ`.
- **Dates**: `backend/lib/dates.py` — `today_iso(tz=None)`. The pod clock is
  UTC; anchor "today" server-side with this, never with client-side date math.
- **Interactive check**: `cd /app/backend && python -c 'import server'` catches
  syntax/import errors without waiting for the supervisor log.

## Frontend

- Vite + React 19 + TypeScript strict, dev server on port `3000`.
- Tailwind CSS v4 (via the `@tailwindcss/vite` plugin — no separate
  `tailwind.config.js` needed) + shadcn/ui, initialized with the `base-nova`
  style and `neutral` base color, `@` path alias (`@/*` → `src/*`) wired in both
  `tsconfig.app.json`/`tsconfig.json` and `vite.config.ts`.
- `react-router-dom` and `motion` are preinstalled — don't re-add them. `src/App.tsx`
  is the `<Routes>` table and nothing else; screens live in `src/pages/*.tsx` and are
  imported as `@/pages/<Name>`. `src/pages/Home.tsx` ships as the worked example. Add
  a `<Route>` for every page you write, in the same edit that creates the page — a
  page with no route is unreachable, and any URL without a matching `<Route>` renders a
  **blank page** — `<Routes>` matches nothing and mounts nothing.
- Components installed under `src/components/ui/`: button, card, input, label,
  select, dialog, sheet, tabs, badge, calendar, sonner, textarea, table, popover,
  dropdown-menu, checkbox. Add more with `npx shadcn@latest add <component>`.
- `src/lib/api.ts` — the typed fetch layer: `apiGet<T>`, `apiPost<T>`,
  `apiPut<T>`, `apiPatch<T>`, `apiDelete<T>`, all relative to base `/api`,
  throwing `ApiError` (with `status` and the parsed body) on any non-2xx.
  **Nothing infers across the Python boundary** — you declare the response type
  yourself as a TS interface mirroring the endpoint's Pydantic model, and keeping
  the two in sync is a manual discipline. When you change a Pydantic model,
  change its TS interface in the same edit.
- `src/pages/Home.tsx` is a minimal example of the wiring: TanStack Query's `useQuery`
  with `apiGet<StatusCheck[]>("/status")` as the `queryFn`. It is a **non-blocking
  connectivity probe**, not a proof of the round trip — the result is deliberately
  discarded so the splash renders identically with no backend. `apiGet<T>` does no
  runtime validation either; `T` is your assertion, not a check. See the
  static-preview rule in `TEMPLATE.md` §4 for why no page may be gated on a fetch.

## TypeScript

`frontend/tsconfig.app.json` / `tsconfig.node.json` have `strict: true`. In the
pod:

```bash
cd frontend && yarn typecheck
```

— plain `tsc --noEmit` run from `frontend/` checks ZERO files (root tsconfig uses
project references with `"files": []`) and exits 0 even with type errors. Always
use `-b` for the frontend. Lint with `cd frontend && yarn lint` (oxlint).

## Data fetching

TanStack Query is wired: `QueryClientProvider` in `src/main.tsx`, `useQuery` demo
in `src/pages/Home.tsx` (see above). Use `useQuery`/`useMutation`, not
fetch-in-`useEffect`.

## Completion gate (tier 1)

When the build is complete, run tier 1 once, all in the same turn: a curl smoke
over the key `/api` endpoints (assert status AND a response field, plus one
negative case), `cd frontend && yarn typecheck`, and ONE happy-path browser pass
through the core user journey. Clean on all three → finish; any failure is a real
bug — fix it, re-run the failed check, and escalate to the testing subagent.
No routine typecheck/lint/smoke passes during the build — tier 1 runs exactly once.


## Testing

Two lanes.

**Backend (pytest)** — specs in `backend/tests/` as `test_*.py`, run with:

```bash
cd /app/backend && pytest
```

`backend/pytest.ini` is canonical: `addopts = -n 2 --dist loadscope` (pytest-xdist,
already parallel — do not pass your own `-n`) and `asyncio_mode = auto` (so
`async def test_...` needs no marker). Serial is `-n 0`, **never**
`-p no:xdist` (that errors, because `addopts` still passes `-n`/`--dist`).
`backend/tests/conftest.py` is pre-scaffolded — a sync `client` fixture
(`httpx.Client` rooted at `/api`), an async `aclient`, and an `api_url()` helper,
all pointed at `BACKEND_URL` (default `http://localhost:8001`). Tests hit the
live uvicorn process, so the app under test is the one the browser sees. Add
app-specific fixtures below the marker; do not re-create the file.

**Frontend (Playwright)** — `/app/tests/` is pre-scaffolded:
`playwright.config.ts` (canonical — edit the marked lines only),
`fixtures/helpers.ts`, and a `package.json` that resolves
`@playwright/test@1.62.0` (node_modules baked into the image). Write specs into
`tests/e2e/`. Do NOT re-create the config/helpers or install/upgrade playwright —
matching Chromium browsers live at `/pw-browsers`.

The backend lane is pytest: this template's backend is Python, so `vitest` does
not apply to it.

## Pod conventions

This template runs under supervisord in the Emergent agent pod — supersedes any
local-run instructions above.

- Backend, frontend, and `mongod` are each a supervisor program. After code or
  config changes, restart and wait for readiness:

  ```bash
  sudo supervisorctl restart frontend backend
  until curl -sf -o /dev/null http://localhost:3000; do sleep 2; done
  ```

- Status, only after a restart you triggered:
  `sudo supervisorctl status frontend backend`. Logs:
  `/var/log/supervisor/backend.err.log`, `backend.out.log`,
  `frontend.err.log`.
- App in a browser: the pod's preview URL (frontend, port `3000`). Backend API
  directly at port `8001`.
- `mongod` runs locally in the pod (`--bind_ip_all`); `MONGO_URL` in
  `backend/.env` points at `localhost`, no separate Mongo container.
- Both dev servers hot-reload on file edits (uvicorn `--reload` for the backend,
  Vite HMR for the frontend); no rebuild step needed for normal iteration. A
  restart is still needed after changing `.env`, `requirements.txt`, or
  `vite.config.ts`.

## Mídia Indoor

A funcionalidade reutiliza os banners, MongoDB, sessão e upload existentes. Entre como **admin** e acesse **Admin → Mídia Indoor** (`/admin/midia-indoor`). A rota antiga `/admin/banners` continua funcionando. Atendentes e compradores não têm permissão de escrita; os endpoints administrativos verificam o perfil no servidor.

### Cadastrar e gerenciar promoções

1. Clique em **Novo banner**, informe título/nome e selecione uma imagem. O upload acontece imediatamente; aguarde o preview antes de salvar.
2. Use JPG/JPEG, PNG, WEBP ou GIF de até **8 MB e 40 megapixels**. O servidor verifica o conteúdo com Pillow, usa nomes UUID e reutiliza uploads idênticos já armazenados quando possível. Arquivos SVG não são aceitos.
3. Informe a **ordem**: números menores aparecem primeiro. Em empates, vale a data de criação e depois o ID. Edite esse número para reorganizar (funciona também no teclado e celular; não há drag-and-drop).
4. Preencha um texto alternativo descrevendo a oferta. Se vazio, será utilizado o título. O link é opcional: use `https://exemplo.com/oferta` ou `/carrinho`; esquemas como `javascript:` são rejeitados.
5. Marque **Banner ativo** e salve. No card, **Ativar/Desativar** controla a exibição. **Editar** permite alterar título, subtítulo, ordem, link, descrição acessível e substituir a imagem pelo mesmo seletor.
6. **Excluir** pede confirmação e remove o cadastro. O arquivo não é apagado: pode estar compartilhado com outro banner/produto. Uploads de formulários cancelados também permanecem no armazenamento; não há limpeza automática de arquivos órfãos.

As imagens são exclusivas da **TV da loja física**, com acesso autenticado pelo Admin; não aparecem na vitrine pública. Em **Admin → Mídia Indoor**, clique em **Exibir na TV / Expandir mídia** e depois no botão **Expandir mídia** da apresentação. Também há o item **TV da loja** no menu. A rota é **`/admin/midia-indoor/tv`**: administradores e atendentes podem apresentar; somente administradores cadastram/alteram promoções. Visitantes são enviados ao login e compradores não têm acesso. A antiga `/midia-indoor` redireciona para a rota protegida.

O botão **Expandir mídia** usa a tela cheia nativa do navegador, ocupando a TV sem a barra do navegador. Pressione **Esc** ou **Sair da tela cheia** para voltar. Os controles ficam discretos em tela cheia e reaparecem ao passar o mouse sobre eles ou focá-los com o teclado. Se a TV não oferecer essa API, use a opção de tela cheia do navegador/F11. Abra a apresentação e faça login no navegador usado na TV. As alterações chegam em cerca de um minuto; o botão Pausar/Continuar controla o loop e o mouse parado não o interrompe. Quando a sessão perder autorização, a apresentação deixa de mostrar as imagens na próxima consulta; entre novamente no Admin.

A imagem é exibida integralmente, sem corte nem distorção (`object-contain`). Títulos/subtítulos continuam no cadastro e no Admin; o slideshow apresenta a arte original, sem texto sobreposto. Inclua preço e mensagens visuais na própria arte. Uma única imagem fica estática (GIF animado conserva sua animação); sem imagens, a tela de TV mostra um estado vazio. Uma imagem que falhar será ignorada até remontar/recarregar a apresentação. Falhas temporárias de rede preservam os dados já carregados; erros de autorização bloqueiam a apresentação.

### Tempo, animação e proporção

Arquivo: **`frontend/src/lib/indoor.ts`**, objeto `INDOOR`:

- `intervalMs: 5000`: intervalo nominal entre trocas. `5000 = 5 segundos`, `10000 = 10 segundos`, `15000 = 15 segundos`. Se a próxima imagem demorar a carregar, a atual permanece até ela estar pronta.
- `transitionMs: 700`: duração do fade; `700 = 0,7 segundo`, `1000 = 1 segundo`. Mantenha menor que o intervalo.
- `easing: "easeInOut"`: suavização, pode ser `"linear"` ou `"easeOut"`.
- `refreshMs: 60000`: consulta dos metadados, `60000 = 1 minuto`. Não é o intervalo do slideshow.
- Dimensões recomendadas: **1920 × 1080, proporção 16:9**; para TV 4K, 3840 × 2160 respeitando os limites de upload.

O tipo de animação é fade em **`frontend/src/components/shop/BannerCarousel.tsx`** (`initial`, `animate` e `exit` do `motion.div`). Para remover, defina `transitionMs: 0`. Para implementar slide, altere essas três propriedades para incluir deslocamento `x`; teste também o retorno da última imagem à primeira. A preferência do sistema por movimento reduzido desativa a transição. Os timers e callbacks de pré-carregamento são limpos ao desmontar; só a imagem atual/próxima e a anterior durante o fade são necessárias, em vez de montar todas as imagens. O servidor já fornece cache de arquivos imutáveis.

Layout: **`frontend/src/index.css`**, regras `.indoor*`. A tela de TV usa `.indoor-fullscreen`; `.indoor-store` permanece como estilo interno e nao e montado na vitrine. `.indoor-store` controla largura máxima (80rem), margem e espaço lateral. `.indoor-stage` define `aspect-ratio: 16 / 9`; por exemplo `4 / 3` altera a proporção na loja. Na TV, `.indoor-fullscreen` ocupa `100svh` de altura e 100% de largura; sobra de espaço aparece na cor de fundo. Imagens verticais também são preservadas. Bordas usam `--border`, fundo `--background`, texto `--foreground`, raio `--radius-2xl`; o botão usa `--card` e foco `--primary`. Não é preciso duplicar cores em variáveis novas.

### Persistência e instalação

Não foi criada outra infraestrutura: coleção **`banners`**, APIs `/api/admin/banners`, `/api/admin/banners/{id}`, `/api/admin/indoor` (somente admin/atendente), `/api/files/upload` e `/api/files/{id}`. Novos campos: `order`, `link`, `alt_text`, `updated_at`; os anteriores `id`, `title`, `subtitle`, `image_file_id`, `active`, `created_at` são preservados. Documentos antigos recebem valores padrão na leitura; não precisam de migration SQL. Banners antigos sem imagem não entram na apresentação e precisam receber uma imagem ao editar. O índice de ordenação é criado pelo mecanismo existente em `backend/lib/db.py`.

Instale a nova dependência **Pillow** usando `pip install -r backend/requirements.txt` no ambiente Python do backend. Mantenha `MONGO_URL`, `DB_NAME`, autenticação e `STORAGE_DIR` já configurados; o padrão dos arquivos é `backend/storage/uploads`. Faça backup do banco **e** dessa pasta e use volume persistente em produção. Reinicie o backend após instalar a dependência. Execute frontend e backend conforme a seção Running; em produção, reconstrua o frontend e mantenha o proxy `/api` e fallback das rotas SPA.

### Proxy reverso e rate limiting em produção

O backend limita requisições pelo endereço que o Uvicorn entrega em `request.client.host` e não confia diretamente em `X-Forwarded-For` enviado pelo cliente. Atrás de um proxy, configure `FORWARDED_ALLOW_IPS` com o IP ou CIDR exato do proxy confiável e inicie o Uvicorn com `--proxy-headers --forwarded-allow-ips "$FORWARDED_ALLOW_IPS"`. O proxy deve substituir os cabeçalhos de encaminhamento recebidos e o acesso direto à origem deve ser bloqueado. Nunca use `*` em uma origem exposta à internet.

O GitHub Pages publica apenas a prévia estática do catálogo. O fluxo definido em `.github/workflows/pages.yml` compila com `VITE_STATIC_CATALOG=true`, exclui as telas administrativas do bundle e não disponibiliza login, pedidos, pagamentos, banco de dados ou APIs. A operação completa exige frontend e backend na mesma origem HTTPS (ou configuração explícita de CORS), MongoDB e armazenamento persistentes.

## Como alterar as informações visuais da página

Os caminhos abaixo são reais. Em desenvolvimento, alterações em TSX/CSS aparecem pelo Vite (salve e atualize a página se necessário), sem reiniciar normalmente. Se `DISABLE_HOT_RELOAD=true`, reinicie o servidor de desenvolvimento. **Em produção, toda alteração de código/arquivo estático exige novo build/publicação do frontend**. Alterações de promoções no Admin não exigem build nem reinício.

| Elemento | Arquivo/local | O que alterar e exemplo | Reiniciar em desenvolvimento? |
| --- | --- | --- | --- |
| Logo | `frontend/public/mv-logo.jpg`; `frontend/src/components/shop/BrandMark.tsx`; `frontend/src/pages/admin/AdminLayout.tsx` | Substitua o JPG mantendo o nome; ajuste `LOGO_SIZES` para tamanho na loja | Não; atualize o navegador/cache |
| Favicon e título da aba | `frontend/index.html` | Troque `href` dos links icon/apple-touch-icon e o conteúdo de `<title>` | Não; recarregue |
| Cores | `frontend/src/index.css`, blocos `:root` e `.dark` | Por exemplo, `--primary: #DAA520` para outra cor; altere ambos os blocos | Não |
| Cores locais existentes | TSX de `frontend/src/pages/Shop.tsx`, `pages/admin/`, `components/shop/` | Existem classes literais como `bg-[#DAA520]`; mudar o token global não altera essas classes. Edite a classe correspondente ou substitua por `bg-primary` | Não |
| Fontes | `frontend/src/index.css`, imports e `@theme inline` | `--font-heading` é Outfit; `--font-sans` é Plus Jakarta Sans. Troque import e família por uma fonte instalada | Não |
| Títulos e textos da loja | `frontend/src/pages/Shop.tsx` | Edite os textos JSX do hero, seções e chamadas | Não |
| Cabeçalho, rodapé e marca escrita | `frontend/src/components/shop/Header.tsx`, `Footer.tsx`, `BrandMark.tsx` | Edite rótulos dos links, textos e nome da marca | Não |
| Imagens e produtos | Admin → Produtos/Categorias; `frontend/public/`; `frontend/src/pages/Shop.tsx` | Troque pelo upload no Admin; para imagens fixas altere o arquivo ou `src` usado na página | Não |
| Ícones | Componentes TSX que importam `lucide-react`; `frontend/src/lib/lucide-react.tsx` | Substitua o ícone importado/utilizado; o arquivo lib adapta ícones legados | Não |
| Backgrounds | `frontend/src/index.css`; classes em `frontend/src/pages/Shop.tsx` | Mude `--background`/`--card` ou gradientes locais do hero | Não |
| Banners / Mídia Indoor | Admin; `frontend/src/components/shop/BannerCarousel.tsx`; `frontend/src/lib/indoor.ts` | Imagens pelo Admin, intervalo `5000` para `10000` no arquivo de configuração | Não |
| Cards | `frontend/src/components/shop/ProductCard.tsx`; `frontend/src/components/ui/card.tsx` | Ajuste padding, imagem, tipografia e borda do card | Não |
| Botões | `frontend/src/components/ui/button.tsx`; classes locais dos consumidores | Ajuste variantes, altura, padding ou `--primary` | Não |
| Espaçamentos | Classes Tailwind em `Shop.tsx`/componentes; `.indoor-store` em `index.css` | `gap-6` para `gap-8`, `py-12` para `py-8`, margem do indoor | Não |
| Bordas e raios | `frontend/src/index.css`; classes `border`/`rounded-*` dos componentes | Mude `--border` ou `--radius: 0.625rem`; classes com valores fixos precisam ser editadas no componente | Não |
| Sombras | Classes `shadow-*` nos componentes; `@keyframes glow-pulse` em `index.css` | Reduza o `box-shadow` do brilho ou remova a classe de animação | Não |
| Responsividade | Prefixos `sm:`, `md:`, `lg:` nos componentes; `.indoor*` em `index.css` | Altere colunas (`sm:grid-cols-2`), largura máxima e espaçamentos, teste celular e TV | Não |

### Verificação

- Frontend: dentro de `frontend`, execute `npm run build` e `npm run lint`.
- Backend: dentro de `backend`, execute `pytest tests/test_indoor.py` com as dependências de teste instaladas. Os testes usam banco isolado em memória, não alteram seu MongoDB.
- Navegador: com frontend na porta 3000, dentro de `tests` execute `npx playwright test e2e/indoor.spec.ts`. Os testes de navegador interceptam a API para verificar slideshow e Admin sem modificar dados reais. Instale as dependências desse diretório e o Chromium do Playwright se necessário.

### Arquivos da implementação e resultado da validação

Criados:
- `frontend/src/lib/indoor.ts`: configuração do slideshow.
- `backend/tests/test_indoor.py`: 12 testes isolados do backend.
- `tests/e2e/indoor.spec.ts`: 4 cenários de navegador executados em desktop e celular (8 testes).

Modificados:
- `backend/models/catalog.py`: campos e validação das promoções.
- `backend/routers/admin.py`: gerenciamento e verificação das imagens.
- `backend/routers/catalog.py`: não disponibiliza mais banners no catálogo público.
- `backend/routers/files.py`: validação real de imagens, limite de leitura e reutilização de uploads.
- `backend/lib/db.py`: índice para consulta dos banners.
- `backend/requirements.txt`: Pillow.
- `frontend/src/lib/types.ts`: espelho dos campos persistidos.
- `frontend/src/pages/admin/AdminBanners.tsx`: interface Mídia Indoor.
- `frontend/src/pages/admin/AdminLayout.tsx`: navegação.
- `frontend/src/App.tsx`: rotas administrativas e redirecionamento da antiga rota pública.
- `frontend/src/pages/admin/IndoorDisplay.tsx`: apresentação protegida e botão de tela cheia.
- `frontend/src/pages/Shop.tsx`: vitrine pública sem Mídia Indoor.
- `frontend/src/components/shop/BannerCarousel.tsx`: slideshow exclusivo para apresentação autenticada na TV.
- `frontend/src/index.css`: layout responsivo usando os tokens existentes.
- `README.md`: operação, configuração e mapa visual.

Validação executada em 17/09/2026: **12 testes de backend e 8 de navegador passaram; build e TypeScript passaram; lint sem erros**, com 19 avisos em arquivos preexistentes fora desta implementação. O Vite avisa que o bundle principal supera 500 kB. Os testes usam persistência substituída em memória/interceptação HTTP; não validam conexão com um MongoDB de produção. O backend foi testado em ambiente Python temporário preparado com uv; instale Pillow no ambiente usado pelo servidor real antes de reiniciá-lo.

### Correção de escopo: TV exclusiva do Admin

A apresentação foi retirada da vitrine. A rota `/admin/midia-indoor/tv` exige
acesso administrativo (admin ou atendente) e oferece **Expandir mídia** usando
a Fullscreen API. O endpoint `/api/admin/indoor` exige o mesmo acesso;
o antigo `/api/catalog/banners` foi removido. O armazenamento de imagens
continua compartilhado com os produtos pelo serviço de arquivos existente.

Validação desta correção: 15 testes do backend e 16 testes de navegador
(desktop/celular) passaram, incluindo autorização, ausência de mídia na loja,
entrada/saída da tela cheia e loop. Build aprovado e lint sem erros.

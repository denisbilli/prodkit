# ProdKit — ROADMAP

Roadmap operativa per costruire la **MVP** di ProdKit: una CLI locale in TypeScript/Node.js che analizza un repository di una web app (anche "vibe-coded") e produce un report di production-readiness, **senza modificare il progetto target** e **senza AI**.

Il documento è organizzato in fasi sequenziali. Ogni fase ha: obiettivo, file da creare, attività, criteri di completamento (DoD).

## Stato avanzamento

- [x] Fase 0 — Setup repository
- [x] Fase 1 — Tipi core e modello dati
- [x] Fase 2 — Utilities
- [x] Fase 3 — Pipeline analyzer (collector)
- [x] Fase 4 — Detector stack base
- [x] Fase 5 — Detector infra/env
- [x] Fase 6 — Detector auth/authz/tenancy
- [x] Fase 7 — Detector security
- [x] Fase 8 — Detector uploads
- [x] Fase 9 — Detector GDPR/privacy
- [x] Fase 10 — Detector billing
- [x] Fase 11 — Detector observability
- [x] Fase 12 — Detector jobs/background
- [x] Fase 13 — Detector deployment
- [x] Fase 14 — Rule engine e regole
- [x] Fase 15 — Scoring e maturity
- [x] Fase 16 — Report builder
- [x] Fase 17 — CLI
- [x] Fase 18 — Fixtures di test
- [x] Fase 19 — Test
- [x] Fase 20 — README e packaging
- [x] Fase 21 — Accettazione finale

---

## Fase 0 — Setup repository

**Obiettivo:** scheletro del progetto pronto a buildare e testare.

**File da creare:**
- `package.json` (bin `prodkit` → `dist/index.js`; dipendenze: `commander`, `fast-glob`, `zod`; dev: `typescript`, `vitest`, `@types/node`, `eslint`, `@typescript-eslint/*`)
- `tsconfig.json` (target ES2022, module commonjs, strict, outDir `dist`, rootDir `src`)
- `tsconfig.test.json` (estende, include `tests/**/*`, `noEmit`)
- `vitest.config.ts` (include `tests/**/*.test.ts`)
- `.gitignore` (`node_modules`, `dist`, `coverage`)
- `.eslintrc.cjs` minimale (parser TS)
- `README.md` (placeholder iniziale)

**DoD:** `npm install` ok, `npm run build` produce `dist/`, `npm test` esegue (anche senza test).

---

## Fase 1 — Tipi core e modello dati

**Obiettivo:** definire i contratti che attraversano l'app.

**File:**
- `src/analyzer/types.ts`
  - `PackageManager`, `StackInfo`, `DetectorEvidence`, `DetectorResult`, `ProjectFiles`, `PackageJson`, `ProjectAnalysis`
- `src/report/types.ts`
  - `Severity` (`info | low | medium | high | critical`)
  - `FindingStatus` (`passed | missing | partial | unknown`)
  - `Category` (security, auth, authz, tenancy, gdpr, uploads, billing, observability, jobs, deployment, stack, env, meta)
  - `Finding` (id, title, severity, category, status, description, evidence, recommendation)
  - `MaturityLevel` (`prototype | early | partial | production_ready`)
  - `ProductionReadinessReport` (overallScore, maturityLevel, detectedStack, findings, critical, warnings, passed, nextSteps, evidenceAppendix, generatedAt, projectPath)
- `src/rules/types.ts`
  - `Rule` (id, title, category, severity, evaluate(analysis) → Finding)
  - `RuleContext` helper

**DoD:** i tipi compilano e sono importabili.

---

## Fase 2 — Utilities

**Obiettivo:** primitive di filesystem riusabili e safe.

**File:**
- `src/utils/pathUtils.ts` → `toPosix`, `resolveProjectPath`
- `src/utils/fileScanner.ts` → `scanFiles({cwd, patterns, ignore})`, `hasFile`; `DEFAULT_IGNORE` con `node_modules`, `.git`, `dist`, `build`, `coverage`, `venv`, `.venv`, `__pycache__`, `.next`, `.cache`
- `src/utils/readTextFileSafe.ts` → `readTextFileSafe(root, rel)` (skip > 1 MB, skip binari via NUL-byte check, mai throw); `readJsonSafe`
- `src/utils/textSearch.ts` → `searchInFiles(root, files, needles[])` con limit e ritorno `{file, line, snippet}`; `anyIncludes`

**DoD:** test unit minimi delle utilities (lettura file mancante, file binario, file grande) passano.

---

## Fase 3 — Pipeline analyzer (collector)

**Obiettivo:** raccogliere input grezzi una sola volta e passarli ai detector.

**File:**
- `src/analyzer/detectContext.ts` → `DetectContext` (root, files, packageJson, pythonDeps, npmDeps); helper `hasDep`, `hasAnyDep`, `hasPyDep`, `hasAnyPyDep`
- `src/analyzer/analyzeProject.ts` → orchestratore:
  1. `scanFiles` per costruire `ProjectFiles` (`all`, `source` filtrato `.ts/.tsx/.js/.jsx/.mjs/.cjs/.py`, `config` filtrato per nomi noti)
  2. Leggere `package.json` con `readJsonSafe`
  3. Leggere `requirements.txt` / `pyproject.toml` → array `pythonDeps` (lowercase)
  4. Costruire `npmDeps` (deps + devDeps lowercase)
  5. Eseguire in parallelo tutti i detector → mappa `detectors`
  6. Comporre `StackInfo` dai risultati di `detectFrontend/Backend/Database/PackageManager`
  7. Restituire `ProjectAnalysis`

**DoD:** `analyzeProject('tests/fixtures/express-basic')` restituisce un oggetto popolato senza errori.

---

## Fase 4 — Detector di stack base

**Obiettivo:** rilevare linguaggio, package manager, frontend, backend, database.

**File:**
- `src/analyzer/detectStack.ts` → combinazione/normalizzazione dei risultati dei detector sotto (helper opzionale)
- `src/analyzer/detectPackageManager.ts`
  - mapping: `pnpm-lock.yaml→pnpm`, `package-lock.json→npm`, `yarn.lock→yarn`, `poetry.lock→poetry`, `pyproject.toml→python`, `requirements.txt→pip`
- `src/analyzer/detectFrontend.ts`
  - React/Vite via deps: `react`, `react-dom`, `vite`, `@vitejs/plugin-react`
  - Extra: `react-router-dom`, `axios`, `tailwindcss`
- `src/analyzer/detectBackend.ts`
  - Express via dep `express` o `require('express')` / `from 'express'`
  - Django: `manage.py` + `settings.py` + `urls.py` + `django` in requirements; >= 2 segnali per confermare
- `src/analyzer/detectDatabase.ts`
  - npm: `pg`, `mongoose`/`mongodb`, `sqlite3`/`better-sqlite3`, `mysql2`, `redis`/`ioredis`/`bull`/`bullmq`
  - py: `psycopg2`, `mysqlclient`, `redis`, `celery`
  - file: `db.sqlite3`
  - docker-compose: `image: postgres|redis|mysql|mongo`

**DoD:** test in `tests/analyzer.test.ts` sulle 4 fixture verificano frontend/backend/db/PM corretti.

---

## Fase 5 — Detector di "infra & env"

**Obiettivo:** Docker, env vars, fallback secrets.

**File:**
- `src/analyzer/detectDocker.ts`
  - `Dockerfile`, `docker-compose.yml`/`compose.yaml`
  - parse leggero: `HEALTHCHECK`, `EXPOSE`, presenza servizi `postgres/redis/nginx`
- `src/analyzer/detectEnv.ts`
  - File: `.env.example`, `.env`, `config/*.ts`, `pydantic` settings, `python-decouple`
  - Riferimenti: `process.env.X`, `os.environ`, `decouple.config`
  - **Fallback secrets** (regex): `JWT_SECRET`, `SECRET_KEY`, `SESSION_SECRET` con valori `changeme`, `your_secret`, `secret`, `fallback-secret`, `change_in_production`, `dev`, `test123`
  - Warning: app legge env ma manca `.env.example`

**DoD:** su `express-basic` rileva fallback secret; su `express-secure` segnala env validation OK.

---

## Fase 6 — Detector auth / authz / tenancy

**File:**
- `src/analyzer/detectAuth.ts`
  - Deps: `jsonwebtoken`, `bcrypt`/`bcryptjs`, `express-session`, `cookie-parser`
  - Django: `django.contrib.auth`, `AUTH_USER_MODEL`
  - Route signals: `/login`, `/register`, `/logout`, `requireAuth`, `auth middleware`
  - 2FA: `speakeasy`, `pyotp`, `qrcode`, `twoFactor`, `two_factor`
  - API keys: `x-api-key`, `apiKey`, `API_KEY`, scope tokens
- (dentro `detectAuth.ts` o file separato `detectAuthz`) authorization:
  - `role`, `requireRole`, `requirePermission`, `isAdmin`, `superadmin`, DRF `permission_classes`, `permissions.py`
  - Partial se solo role-check semplice senza permessi a livello risorsa
- `src/analyzer/detectTenancy.ts` (può stare in detectAuth oppure separato):
  - keyword: `organization`, `tenant`, `membership`, `team`, `workspace`, `company`
  - **Euristica B2B SaaS**: Stripe OR billing/subscription OR admin/users routes OR keyword org/team/company → se vero ma nessun concetto tenant ⇒ finding HIGH

**DoD:** `express-basic` → auth presente, authz partial, tenancy missing; `express-secure` → auth + authz pass.

---

## Fase 7 — Detector security

**File:**
- `src/analyzer/detectSecurity.ts`
  - Helmet (`helmet`), rate limit (`express-rate-limit`)
  - CORS: presenza `cors(...)` con/senza `origin` esplicito
  - Django: `CSRF`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `SECURE_SSL_REDIRECT`, `SECURE_PROXY_SSL_HEADER`, `DEBUG=True`
  - Webhook signature validation (es. `stripe.webhooks.constructEvent`)
  - Limit body size (`express.json({limit})`), content-type check
  - Findings:
    - `cors()` senza origin esplicito → medium/high
    - missing helmet → medium
    - missing rate limit su auth → medium
    - fallback secret → critical
    - `DEBUG=True` Django → critical/high a seconda del contesto (prod vs dev)

**DoD:** test su `express-basic` e `django-basic` verificano i finding attesi.

---

## Fase 8 — Detector uploads

**File:**
- `src/analyzer/detectUploads.ts`
  - npm: `multer`, `formidable`
  - Esposizione pubblica: `express.static('uploads')`, route `/uploads`
  - Django: `MEDIA_ROOT`, `MEDIA_URL`
  - Object storage: `aws-sdk`, `@aws-sdk/client-s3`, `boto3`
  - Antivirus: `clamav`, `clamscan`
  - Validation: `file-type`, MIME check, magic bytes
  - **Finding HIGH** se uploads serviti pubblicamente senza auth middleware sulla stessa route

**DoD:** `express-basic` flagga public uploads HIGH; `express-secure` passa.

---

## Fase 9 — Detector GDPR / privacy

**File:**
- `src/analyzer/detectGdpr.ts`
  - Keyword: `gdpr`, `consent`, `export user data`, `dataExport`, `erasure`, `delete account`, `retention`, `privacy policy`
  - Se l'app ha users/auth ma nessuno di questi segnali → finding `missing`

**DoD:** `express-basic` segnala GDPR missing; `express-secure` può ancora segnalare missing se la fixture non li include (documentare).

---

## Fase 10 — Detector billing

**File:**
- `src/analyzer/detectBilling.ts`
  - Deps: `stripe`
  - Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  - Keyword: `checkout`, `subscription`, `customerId`, `plan`, `tier`
  - Webhook route + signature validation (`constructEvent`) — se Stripe c'è ma signature missing → medium

**DoD:** test su fixture custom (opzionale) o su express-secure se contiene Stripe.

---

## Fase 11 — Detector observability

**File:**
- `src/analyzer/detectObservability.ts`
  - Logging: `winston`, `pino`, `morgan`, `bunyan`
  - Error tracking: `@sentry/node`, `sentry-sdk`
  - Correlation/request id middleware (`x-request-id`, `correlation-id`)
  - Health endpoint: route `/health`, `/healthz`, `/readyz`
  - Global error handler in Express
  - Django: rotating file logger config
  - Warnings se: no healthcheck, no structured logging

**DoD:** verifiche sulle fixture.

---

## Fase 12 — Detector jobs / background

**File:**
- `src/analyzer/detectJobs.ts`
  - npm: `bull`, `bullmq`, `node-cron`, `agenda`
  - py: `celery`, `apscheduler`, `rq`
  - File: `worker.ts`, `workers/*`, `tasks.py`, script `backup`/`cleanup` in `scripts/`

**DoD:** detector restituisce evidenze coerenti.

---

## Fase 13 — Detector deployment

**File:**
- `src/analyzer/detectDeployment.ts`
  - `Dockerfile`, `docker-compose`, `nginx.conf`, `Procfile`
  - CI: `.github/workflows/*.yml`
  - Healthcheck (Docker o app)
  - Graceful shutdown: handler `SIGTERM`/`SIGINT`
  - `NODE_ENV=production` consapevolezza
  - Django: `DEBUG=False` in produzione

**DoD:** segnala finding coerenti.

---

## Fase 14 — Rule engine e regole

**Obiettivo:** trasformare detector → finding categorizzati e con severità.

**File:**
- `src/rules/ruleEngine.ts`
  - `runRules(analysis): Finding[]`
  - Itera array di `Rule`, raccoglie `Finding`
- `src/rules/rules.ts`
  - Una `Rule` per ciascuna feature chiave. Esempi:
    - `security.helmet` (Express only): missing → medium
    - `security.rateLimit` (auth routes): missing → medium
    - `security.cors.explicitOrigin`: missing → medium/high
    - `security.fallbackSecret`: present → critical
    - `uploads.publicExposure`: present → high
    - `auth.basic`: present → passed
    - `authz.resourceLevel`: partial → medium
    - `tenancy.multitenant` (se B2B saas): missing → high
    - `gdpr.privacy`: missing → medium
    - `billing.stripe.webhookSignature`: missing → medium
    - `observability.healthcheck`: missing → low
    - `observability.structuredLogging`: missing → low
    - `deployment.dockerfile`: present → passed
    - `django.debug.production`: present → critical
    - `django.secureCookies`: missing → high
  - Ogni regola usa i `DetectorResult` indicizzati per `key`.

**DoD:** dato l'analisi di `express-basic` la lista findings contiene almeno: critical fallback secret, high public uploads, medium missing helmet, medium missing rate limit.

---

## Fase 15 — Scoring e maturity

**File:**
- `src/report/score.ts`
  - `computeScore(findings)`: parte da 100, sottrae `critical=-15`, `high=-10`, `medium=-5`, `low=-2`, `info=0`. Clamp `[0,100]`.
  - `computeMaturity(score)`:
    - 0–39 → `prototype`
    - 40–64 → `early`
    - 65–84 → `partial`
    - 85–100 → `production_ready`

**DoD:** test unit dedicati in `tests/report.test.ts`.

---

## Fase 16 — Report builder

**File:**
- `src/report/buildReport.ts` → `buildReport(analysis): ProductionReadinessReport`
  - chiama `runRules`, raggruppa per categoria, separa `critical`/`warnings`/`passed`
  - genera `nextSteps`: top N findings con severity alta ordinati per impatto
  - costruisce `evidenceAppendix`
- `src/report/markdownReport.ts` → `renderMarkdown(report): string`
  - sezioni: titolo, timestamp, detected stack, score, maturity level, executive summary, critical findings, findings per categoria, passed checks, suggested next steps, appendix evidence
- `src/report/jsonReport.ts` → `renderJson(report): string` (JSON.stringify indent 2)

**DoD:** snapshot test markdown su fixture stabile (no timestamp).

---

## Fase 17 — CLI

**File:**
- `src/cli.ts`
  - Usa `commander`
  - Comando: `prodkit analyze <path> [--format markdown|json] [--output <file>]`
  - Default format: `markdown` su file se `--output`, altrimenti **summary in terminale**
  - Flusso: resolve path → `analyzeProject` → `buildReport` → render → stampa o scrive
  - Summary terminale: project path, detected stack, score, maturity, count critical/high/medium, top 10 findings, path report se scritto
- `src/index.ts`
  - `#!/usr/bin/env node` + `import './cli'`
  - Assicurarsi shebang preservato nel file compilato (`dist/index.js`); rendere il file eseguibile su Unix tramite `package.json` `bin`

**DoD:** `node dist/index.js analyze tests/fixtures/express-basic` stampa il summary; `--output report.md` scrive il file.

---

## Fase 18 — Fixtures di test

Creare contenuti realistici minimi.

**`tests/fixtures/express-basic/`** — score basso, molte issue
- `package.json`: deps `express`, `cors`, `jsonwebtoken`, `multer`
- `index.js`:
  - `cors()` senza origin
  - `app.use('/uploads', express.static('uploads'))`
  - `jwt.sign(..., process.env.JWT_SECRET || 'changeme')`
  - route `/login`, `/register` senza rate limit
  - nessun `helmet`

**`tests/fixtures/express-secure/`** — score alto
- `package.json`: deps `express`, `helmet`, `express-rate-limit`, `cors`, `zod`, `jsonwebtoken`, `bcrypt`, `pino`
- `.env.example` con `JWT_SECRET=`, `DATABASE_URL=`
- `src/index.ts`:
  - `app.use(helmet())`
  - `cors({ origin: process.env.CORS_ORIGIN })`
  - `rateLimit` su `/auth/*`
  - uploads dietro `requireAuth`
  - `/health` endpoint
  - graceful shutdown `SIGTERM`
- `src/env.ts`: validazione `zod`

**`tests/fixtures/react-vite/`**
- `package.json` con `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `react-router-dom`, `tailwindcss`
- `vite.config.ts` minimal
- `src/main.tsx` placeholder

**`tests/fixtures/django-basic/`**
- `manage.py`, `requirements.txt` con `Django`
- `myapp/settings.py` con:
  - `DEBUG = True`
  - `SECRET_KEY = 'changeme'`
  - `SESSION_COOKIE_SECURE = False`
  - `CSRF_COOKIE_SECURE = False`
- `myapp/urls.py` placeholder

**DoD:** le 4 directory esistono e sono **escluse dal `tsconfig` di build** (sì in `tsconfig.test.json`).

---

## Fase 19 — Test

**File:**
- `tests/analyzer.test.ts`
  - Per ogni fixture verifica `stack` rilevato (frontend/backend/db/pm)
  - Verifica presenza dei detector chiave (`security.helmet`, `uploads.publicExposure`, ...)
- `tests/report.test.ts`
  - `express-basic` → score < 50, contiene finding critical `fallback secret`, high `public uploads`
  - `express-secure` → score > 75, passed checks per helmet/rate-limit
  - `react-vite` → frontend detection includes react+vite
  - `django-basic` → critical `DEBUG=True`, high insecure cookies
  - Unit test `computeScore`/`computeMaturity` con casi tabellari
- (opzionale) `tests/utils.test.ts` per `readTextFileSafe` su file mancante / binario / grande

**DoD:** `npm test` verde su Linux/macOS/Windows.

---

## Fase 20 — README e packaging

**File:**
- `README.md`:
  - Cos'è ProdKit
  - Installation (clone + `npm install` + `npm link`, oppure `npx`)
  - Local development (`npm run build`, `npm run dev`, `npm test`)
  - Commands (`prodkit analyze <path> [--format] [--output]`)
  - Examples (3-4 invocazioni)
  - Supported stacks (Express, React/Vite, Django, fallback generico)
  - Current limitations (no AI, no patching, detection euristica)
  - Roadmap:
    1. deterministic analyzer (MVP attuale)
    2. AI-assisted explanation layer
    3. patch planning
    4. patch generation
    5. framework adapters
    6. dashboard

**DoD:** README leggibile, copia-incolla dei comandi funzionante.

---

## Fase 21 — Accettazione finale

Eseguire localmente, in ordine, e verificare exit code 0:

```bash
npm install
npm run build
npm test
npm link
prodkit analyze tests/fixtures/express-basic --format markdown
prodkit analyze tests/fixtures/express-basic --format json
prodkit analyze tests/fixtures/express-basic --output report.md
```

**Verifiche manuali:**
- `report.md` esiste e contiene sezioni attese
- output JSON è parseable
- summary terminale leggibile
- nessun crash su file binari / grandi / permessi negati
- esecuzione non modifica il progetto target (read-only)

**DoD MVP raggiunta.**

---

## Note trasversali (vincoli da rispettare in ogni fase)

- TypeScript strict, niente `any` inutile.
- Mai modificare il progetto target: solo lettura.
- Mai crashare: ogni I/O dentro `try/catch` o helper safe.
- Ignorare sempre: `node_modules`, `.git`, `dist`, `build`, `coverage`, `venv`, `.venv`, `__pycache__`.
- Limite file 1 MB; skip binari.
- Ogni detector è isolato, puro su `DetectContext`, testabile.
- Ogni finding ha `evidence` non vuoto.
- Niente percorsi assoluti hardcoded; usare `path.join` / `path.resolve`.
- Niente chiamate di rete, niente AI, niente telemetria.
- Cross-platform: usare separator posix nelle stringhe persistite.

---

## Out of scope (rinviato a fasi successive del prodotto)

- Layer AI di spiegazione e prioritizzazione.
- Patch planning e patch generation automatiche.
- Adapter per framework aggiuntivi (Next.js, FastAPI, NestJS, Rails, Laravel).
- Dashboard web / cloud.
- Integrazione CI (GitHub Action, pre-commit).
- Telemetria anonima opt-in.
